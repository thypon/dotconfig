import { historyTokens, type SkillState, type WithParts } from "./state"

const KEEP_PART_TYPES = new Set(["tool", "step-start", "step-finish"])

export interface CollapseResult {
  kept: number
  original: number
  tokensOriginal: number
  tokensSent: number
}

export function collapse(messages: WithParts[], st: SkillState): CollapseResult {
  const n = messages.length
  if (n === 0) return { kept: 0, original: 0, tokensOriginal: 0, tokensSent: 0 }
  const tokensOriginal = historyTokens(messages)

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
    // latest observation is the new user turn; the previous assistant turn is stale
    if (pIdx >= 0) keep.add(pIdx)
    keep.add(lastUserAfter)
  } else {
    // latest observation is the trailing tool results on the last assistant message
    if (pIdx >= 0 && pIdx !== lastAssistant) keep.add(pIdx)
    if (lastAssistant >= 0) {
      keep.add(lastAssistant)
      const msg = messages[lastAssistant]!
      messages[lastAssistant] = { info: msg.info, parts: msg.parts.filter((p) => KEEP_PART_TYPES.has(p.type)) }
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
