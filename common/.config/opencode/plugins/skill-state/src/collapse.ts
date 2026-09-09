import { historyTokens, type SkillState, type WithParts } from "./state"

const KEEP_PART_TYPES = new Set(["tool", "step-start", "step-finish"])
const LOOP_WINDOW = 6
const LOOP_THRESHOLD = 3

export interface CollapseResult {
  kept: number
  original: number
  tokensOriginal: number
  tokensSent: number
}

const SIM_THRESHOLD = 0.6
const CLEAN_DECAY_AFTER = 3

interface ToolSig {
  tool: string
  args: string
  out: string
}

function toolSigs(messages: WithParts[]): ToolSig[] {
  const sigs: ToolSig[] = []
  for (const m of messages) {
    if (m.info.role !== "assistant") continue
    for (const p of m.parts) {
      if (p.type !== "tool") continue
      const state = p.state as { input?: unknown; output?: string } | undefined
      sigs.push({ tool: p.tool as string, args: JSON.stringify(state?.input ?? null), out: state?.output ?? "" })
    }
  }
  return sigs
}

const tokensOf = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])

// --- tree-sitter structural signatures for bash commands ---
type TSNode = { type: string; text: string; childCount: number; children: TSNode[]; namedChildren: TSNode[]; parent: TSNode | null }
let bashParser: { parse: (s: string) => { rootNode: TSNode } } | null = null
let parserReady = false

function getBashParser() {
  if (parserReady || bashParser) return bashParser
  try {
    const { Parser, Language } = require("tree-sitter")
    const parser = new Parser()
    parser.setLanguage(require("tree-sitter-bash"))
    bashParser = parser
  } catch {
    bashParser = null
  }
  parserReady = true
  return bashParser
}

// Structural signature: node-type skeleton where word text is kept with
// digits wildcarded (i=1 → i=N) and quoted literals are dropped entirely.
// echo 'one' >> out.txt ≡ echo 'two' >> out.txt; git status ≠ git diff.
function astSig(cmd: string): string | null {
  const parser = getBashParser()
  if (!parser) return null
  try {
    const acc: string[] = []
    const walk = (n: TSNode, parentType: string) => {
      if (n.type === "program") {
        for (const c of n.children) walk(c, "program")
        return
      }
      if (n.type === "word") {
        acc.push(parentType === "command_name" ? `word:${n.text}` : `word:${n.text.replace(/\d+/g, "N")}`)
      } else {
        acc.push(n.type)
      }
      for (const c of n.namedChildren) walk(c, n.type)
    }
    walk(parser.parse(cmd).rootNode, "program")
    return acc.join("/")
  } catch {
    return null
  }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 1 : inter / union
}

function stripDigits(tokens: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const t of tokens) if (!/^\d+$/.test(t)) out.add(t)
  return out
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const t of a) if (!b.has(t)) return false
  return true
}

// Parameterized progress: commands whose token sets differ ONLY in digit
// values (echo 'i=5 total=15' vs 'i=6 total=21', heredoc bodies with new
// line numbers) are advancing work, not a loop.
function isProgressPair(a: ToolSig, b: ToolSig): boolean {
  const split = (tokens: Set<string>) => {
    const nonDigits = new Set<string>()
    const digits = new Set<string>()
    for (const t of tokens) (/^[0-9]+$/.test(t) ? digits : nonDigits).add(t)
    return { nonDigits, digits }
  }
  const pa = split(tokensOf(a.args))
  const pb = split(tokensOf(b.args))
  return setsEqual(pa.nonDigits, pb.nonDigits) && !setsEqual(pa.digits, pb.digits)
}

// Fresh output = the environment re-informed the model, so repeating the
// command is not amnesia — only stale/identical output makes a repeat a loop.
function outputsSimilar(a: ToolSig, b: ToolSig): boolean {
  if (a.out === b.out) return true
  return jaccard(tokensOf(a.out), tokensOf(b.out)) >= SIM_THRESHOLD
}

function similar(a: ToolSig, b: ToolSig): boolean {
  if (a.tool !== b.tool) return false
  if (isProgressPair(a, b)) return false
  if (!outputsSimilar(a, b)) return false
  if (a.tool === "bash") {
    // tree-sitter structural equality: same command shape (literal values
    // normalized, digits wildcarded) counts as a duplicate even when token
    // Jaccard fails on reworded arguments
    if (astSig(a.args) !== null && astSig(a.args) === astSig(b.args)) return true
  }
  return jaccard(tokensOf(a.args), tokensOf(b.args)) >= SIM_THRESHOLD
}

export function isLooped(messages: WithParts[]): boolean {
  const sigs = toolSigs(messages)
  if (sigs.length >= 2 && similar(sigs[sigs.length - 1]!, sigs[sigs.length - 2]!)) return true
  const recent = sigs.slice(-LOOP_WINDOW)
  for (let i = 0; i < recent.length; i++) {
    let hits = 0
    for (let j = 0; j < recent.length; j++) {
      if (i !== j && similar(recent[i]!, recent[j]!)) hits++
    }
    if (hits >= 2) return true
  }
  return false
}

const pow2 = (e: number): number => Math.min(2 ** e, 1 << 12)

export function collapse(messages: WithParts[], st: SkillState): CollapseResult {
  const n = messages.length
  if (n === 0) return { kept: 0, original: 0, tokensOriginal: 0, tokensSent: 0 }
  const tokensOriginal = historyTokens(messages)

  const looped = isLooped(messages)
  if (looped) {
    st.loopCount = (st.loopCount ?? 0) + 1
    st.cleanStreak = 0
  } else {
    st.cleanStreak = (st.cleanStreak ?? 0) + 1
    if ((st.cleanStreak ?? 0) >= CLEAN_DECAY_AFTER) {
      st.loopCount = Math.max(0, (st.loopCount ?? 0) - 1)
      st.cleanStreak = 0
    }
  }
  const e = looped ? (st.loopCount ?? 1) - 1 : -1

  let pIdx = st.pMessageID ? messages.findIndex((m) => m.info.id === st.pMessageID) : -1
  if (pIdx < 0) pIdx = messages.findIndex((m) => m.info.role === "user")

  let lastAssistant = -1
  for (let i = 0; i < n; i++) {
    if (messages[i]!.info.role === "assistant") lastAssistant = i
  }

  let lastUserAfter = -1
  for (let i = lastAssistant + 1; i < n; i++) {
    if (messages[i]!.info.role === "user") lastUserAfter = i
  }

  const keep = new Set<number>()
  if (lastUserAfter >= 0) {
    if (pIdx >= 0) keep.add(pIdx)
    keep.add(lastUserAfter)
  } else {
    if (pIdx >= 0 && pIdx !== lastAssistant) keep.add(pIdx)
    if (lastAssistant >= 0) {
      keep.add(lastAssistant)
      const msg = messages[lastAssistant]!
      messages[lastAssistant] = { info: msg.info, parts: msg.parts.filter((p) => KEEP_PART_TYPES.has(p.type)) }
    }
  }

  if (looped && e >= 0) {
    const toolIdx: number[] = []
    for (let i = 0; i < n; i++) {
      if (i === lastAssistant || i === lastUserAfter) continue
      if (messages[i]!.info.role === "assistant" && messages[i]!.parts.some((p) => p.type === "tool")) toolIdx.push(i)
    }
    const cmdLookback = toolIdx.slice(-pow2(e))
    for (const i of cmdLookback) keep.add(i)

    if (e - 1 >= 0) {
      const userIdx: number[] = []
      for (let i = 0; i < n; i++) {
        if (i === pIdx || i === lastUserAfter) continue
        if (messages[i]!.info.role === "user") userIdx.push(i)
      }
      for (const i of userIdx.slice(-pow2(e - 1))) keep.add(i)
    }

    const thinkCount = e - 4 >= 0 ? pow2(e - 4) : 0
    const thinkCovered = new Set(thinkCount > 0 ? cmdLookback.slice(-thinkCount) : [])
    for (const i of cmdLookback) {
      const msg = messages[i]!
      if (thinkCovered.has(i)) {
        messages[i] = { info: msg.info, parts: msg.parts.filter((p) => p.type === "reasoning" || KEEP_PART_TYPES.has(p.type)) }
      } else {
        messages[i] = { info: msg.info, parts: msg.parts.filter((p) => KEEP_PART_TYPES.has(p.type)) }
      }
    }
  }

  const retained: WithParts[] = []
  for (let i = 0; i < n; i++) {
    if (keep.has(i)) retained.push(messages[i]!)
  }
  messages.length = 0
  for (const m of retained) messages.push(m)

  const tokensSent = historyTokens(retained)
  st.iterations++
  st.tokensOriginal += tokensOriginal
  st.tokensSent += tokensSent

  return { kept: retained.length, original: n, tokensOriginal, tokensSent }
}
