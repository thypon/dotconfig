import { Type } from "typebox"
import { createHash } from "node:crypto"
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

const DEFAULT_PREFIX = "#HL "
const REV_PREFIX = "REV:"
const MAX_PROCESSED_IDS = 10000

interface HashlineConfig {
  maxFileSize: number
  hashLength: number
  cacheSize: number
  prefix: string | false
  debug: boolean
  fileRev: boolean
  safeReapply: boolean
  exclude: string[]
}

const DEFAULTS: HashlineConfig = {
  maxFileSize: 0,
  hashLength: 0,
  cacheSize: 2000,
  prefix: DEFAULT_PREFIX,
  debug: false,
  fileRev: true,
  safeReapply: true,
  exclude: [],
}

let config: HashlineConfig = { ...DEFAULTS }

class BoundedSet {
  #max: number
  #set = new Set<string>()
  constructor(max: number) { this.#max = max }
  has(v: string) { return this.#set.has(v) }
  add(v: string) {
    if (this.#set.size >= this.#max) {
      const first = this.#set.values().next().value
      if (first !== undefined) this.#set.delete(first)
    }
    this.#set.add(v)
  }
}

class HashCache {
  #cache = new Map<string, string>()
  #max: number
  constructor(max: number) { this.#max = max }
  get(key: string, content: string): string | null {
    const entry = this.#cache.get(key)
    if (!entry) return null
    const [cachedContent, annotated] = entry.split("\x00-----HASHLINE-----\x00")
    if (cachedContent !== content) { this.#cache.delete(key); return null }
    return annotated
  }
  set(key: string, content: string, annotated: string) {
    if (this.#cache.size >= this.#max) {
      const first = this.#cache.keys().next().value
      if (first !== undefined) this.#cache.delete(first)
    }
    this.#cache.set(key, `${content}\x00-----HASHLINE-----\x00${annotated}`)
  }
  invalidate(key: string) { this.#cache.delete(key) }
}

const cache = new HashCache(config.cacheSize)

function debug(...args: unknown[]) {
  if (!config.debug) return
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`
  try { appendFileSync(join(homedir(), ".config", "pi", "hashline-debug.log"), line) } catch {}
}

function getByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

function computeLineHash(line: string, hashLen: number): string {
  const h = createHash("sha256").update(line).digest("hex")
  return h.substring(0, hashLen)
}

function computeFileRev(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 8)
}

function getAdaptiveHashLength(totalLines: number, userHashLen?: number): number {
  if (userHashLen && userHashLen > 0) return userHashLen
  return totalLines <= 4096 ? 3 : 4
}

function detectLineEnding(content: string): string {
  if (content.includes("\r\n")) return "\r\n"
  return "\n"
}

function normalizeHashRef(ref: string, prefix: string): string {
  let r = ref.trim()
  if (r.startsWith(prefix)) r = r.substring(prefix.length)
  return r
}

function parseHashRef(ref: string, prefix: string): { line: number; hash: string } | null {
  const norm = normalizeHashRef(ref, prefix)
  const m = norm.match(/^(\d+):([a-f0-9]+)$/)
  if (!m) return null
  return { line: Number(m[1]), hash: m[2] }
}

function formatFileWithHashes(content: string, hashLen?: number, userPrefix?: string | false, fileRev?: boolean): string {
  const prefix = userPrefix === false ? "" : (userPrefix ?? DEFAULT_PREFIX)
  const lines = content.split(/\r?\n/)
  const actualHashLen = getAdaptiveHashLength(lines.length, hashLen)
  const eol = detectLineEnding(content)

  const result: string[] = []
  if (fileRev !== false) {
    result.push(`${prefix}REV:${computeFileRev(content)}`)
  }
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i], actualHashLen)
    result.push(`${prefix}${i + 1}:${hash}|${lines[i]}`)
  }
  return result.join(eol)
}

function stripHashes(content: string, userPrefix?: string | false): string {
  const prefix = userPrefix === false ? "" : (userPrefix ?? DEFAULT_PREFIX)
  if (!prefix) return content

  const revLine = `${prefix}REV:`
  const lines = content.split(/\r?\n/)
  const stripped: string[] = []
  for (const line of lines) {
    if (line.startsWith(revLine)) continue
    if (line.startsWith(prefix)) {
      const idx = line.indexOf("|")
      if (idx === -1) { stripped.push(line); continue }
      stripped.push(line.substring(idx + 1))
    } else {
      stripped.push(line)
    }
  }
  return stripped.join("\n")
}

function resolveRange(startRef: string, endRef: string | undefined, content: string, prefix: string): { start: number; end: number } {
  const p = parseHashRef(startRef, prefix)
  if (!p) throw new HashlineError("INVALID_REF", startRef)
  const lines = content.split(/\r?\n/)
  const actualPrefix = `${prefix}${p.line}:${p.hash}|`

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(actualPrefix)) { startLine = i; break }
  }
  if (startLine === -1) throw new HashlineError("HASH_MISMATCH", startRef)

  if (!endRef) return { start: startLine, end: startLine }

  const ep = parseHashRef(endRef!, prefix)
  if (!ep) throw new HashlineError("INVALID_REF", endRef!)
  const endActualPrefix = `${prefix}${ep.line}:${ep.hash}|`

  let endLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(endActualPrefix)) { endLine = i; break }
  }
  if (endLine === -1) throw new HashlineError("HASH_MISMATCH", endRef!)

  if (startLine > endLine) throw new HashlineError("INVALID_RANGE", `${startRef}..${endRef}`)
  return { start: startLine, end: endLine }
}

function findCandidateLines(content: string, hash: string, hashLen: number, prefix: string): number[] {
  const lines = content.split(/\r?\n/)
  const candidates: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^\\${prefix}(\\d+):([a-f0-9]+)\\|`))
    if (m && m[2] === hash) candidates.push(i)
  }
  return candidates
}

function replaceRange(lines: string[], start: number, end: number, replacement: string | undefined, prefix: string, hashLen: number): string[] {
  const newLines = replacement !== undefined ? replacement.split(/\r?\n/) : []
  const result: string[] = []

  for (let i = 0; i < start; i++) result.push(lines[i])
  for (const nl of newLines) {
    const hash = computeLineHash(nl, hashLen)
    result.push(`${prefix}${start + result.length - start + 1}:${hash}|${nl}`)
  }
  for (let i = end + 1; i < lines.length; i++) result.push(lines[i])
  return result
}

function stripAllHashes(lines: string[], prefix: string): string[] {
  return lines.map(line => {
    if (line.startsWith(prefix + "REV:")) return line
    if (line.startsWith(prefix)) {
      const idx = line.indexOf("|")
      if (idx === -1) return line
      return line.substring(idx + 1)
    }
    return line
  })
}

function rehashStrippedLines(lines: string[], prefix: string, hashLen: number, content: string): string[] {
  const eol = detectLineEnding(content)
  const rawContent = stripAllHashes(lines, prefix).join(eol)
  const revLine = `${prefix}REV:${computeFileRev(rawContent)}`
  const result = formatFileWithHashes(rawContent, hashLen, prefix === "" ? false : prefix, true)
  return result.split(/\r?\n/)
}

function verifyHash(line: string, hash: string, hashLen: number): { valid: boolean; computedHash: string } {
  const computed = computeLineHash(line, hashLen)
  return { valid: computed === hash, computedHash: computed }
}

class HashlineError extends Error {
  code: string
  ref: string
  constructor(code: string, ref: string) {
    super(`Hashline ${code}: ${ref}`)
    this.code = code
    this.ref = ref
  }
  toDiagnostic(): string {
    const msgs: Record<string, string> = {
      INVALID_REF: `Invalid hash reference: "${this.ref}"`,
      HASH_MISMATCH: `Hash mismatch for reference: "${this.ref}". File may have changed — re-read it.`,
      INVALID_RANGE: `Invalid range: "${this.ref}"`,
      FILE_REV_MISMATCH: `File revision mismatch. File was modified since last read — re-read it.`,
      TARGET_OUT_OF_RANGE: `Target line out of range: "${this.ref}"`,
      AMBIGUOUS_REAPPLY: `Ambiguous reapply: multiple candidate lines found for "${this.ref}" — re-read the file.`,
      MISSING_REPLACEMENT: `Missing replacement content for operation involving "${this.ref}"`,
    }
    return msgs[this.code] ?? `Hashline error: ${this.code} (${this.ref})`
  }
}

type HashEditOp = "replace" | "delete" | "insert_before" | "insert_after"

interface HashEditInput {
  operation: HashEditOp
  startRef: string
  endRef?: string
  replacement?: string
  fileRev?: string
}

function applyHashEdit(input: HashEditInput, annotatedContent: string, hashLenArg?: number, safeReapply?: boolean): { content: string; startLine: number; endLine: number } {
  const prefix = config.prefix === false ? "" : config.prefix
  const hashLen = hashLenArg ?? getAdaptiveHashLength(annotatedContent.split(/\r?\n/).length)
  const eol = detectLineEnding(annotatedContent)

  const rawLines = stripAllHashes(annotatedContent.split(/\r?\n/), prefix)
  const rawContent = rawLines.join(eol)

  if (input.fileRev) {
    const prefixStr = prefix + "REV:"
    const annotatedLines = annotatedContent.split(/\r?\n/)
    const revLine = annotatedLines.find(l => l.startsWith(prefixStr))
    if (revLine) {
      const statedRev = revLine.substring(prefixStr.length)
      const actualRev = computeFileRev(rawContent)
      if (statedRev !== actualRev) {
        throw new HashlineError("FILE_REV_MISMATCH", input.fileRev)
      }
    }
  }

  let lines = annotatedContent.split(/\r?\n/)
  let { start, end } = resolveRange(input.startRef, input.endRef, annotatedContent, prefix)

  // Handle hash mismatch via safe reapply
  const tryResolve = (ref: string): number => {
    const p = parseHashRef(ref, prefix)
    if (!p) throw new HashlineError("INVALID_REF", ref)
    const prefixStr = `${prefix}${p.line}:${p.hash}|`
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(prefixStr)) return i
    }
    if (!safeReapply) throw new HashlineError("HASH_MISMATCH", ref)
    const candidates = findCandidateLines(annotatedContent, p.hash, hashLen, prefix)
    if (candidates.length === 0) throw new HashlineError("HASH_MISMATCH", ref)
    if (candidates.length > 1) throw new HashlineError("AMBIGUOUS_REAPPLY", ref)
    return candidates[0]
  }

  let actualStart: number
  let actualEnd: number
  try {
    actualStart = tryResolve(input.startRef)
  } catch (e) {
    if (e instanceof HashlineError) throw e
    throw new HashlineError("HASH_MISMATCH", input.startRef)
  }

  if (input.endRef) {
    try {
      actualEnd = tryResolve(input.endRef)
    } catch (e) {
      if (e instanceof HashlineError) throw e
      throw new HashlineError("HASH_MISMATCH", input.endRef!)
    }
  } else {
    actualEnd = actualStart
  }

  if (actualStart > actualEnd) throw new HashlineError("INVALID_RANGE", `${input.startRef}..${input.endRef ?? input.startRef}`)

  let newLines: string[]
  switch (input.operation) {
    case "replace": {
      if (input.replacement === undefined) throw new HashlineError("MISSING_REPLACEMENT", input.startRef)
      // Replace range: remove lines start..end, insert new content, rehash everything
      const before = lines.slice(0, actualStart)
      const repl = input.replacement.split(/\r?\n/)
      const after = lines.slice(actualEnd + 1)
      const combined = [...before, ...repl, ...after]
      const rehashedRaw = stripAllHashes(combined, prefix).join(eol)
      lines = formatFileWithHashes(rehashedRaw, hashLen, prefix === "" ? false : prefix, true).split(/\r?\n/)
      return { content: lines.join(eol), startLine: actualStart + 1, endLine: actualEnd + 1 }
    }
    case "delete": {
      if (input.replacement !== undefined) {
        // If replacement is provided with delete, treat as replace
      }
      const before = lines.slice(0, actualStart)
      const after = lines.slice(actualEnd + 1)
      const combined = [...before, ...after]
      const rehashedRaw = stripAllHashes(combined, prefix).join(eol)
      lines = formatFileWithHashes(rehashedRaw, hashLen, prefix === "" ? false : prefix, true).split(/\r?\n/)
      return { content: lines.join(eol), startLine: actualStart + 1, endLine: actualEnd + 1 }
    }
    case "insert_before": {
      if (input.replacement === undefined) throw new HashlineError("MISSING_REPLACEMENT", input.startRef)
      const before = lines.slice(0, actualStart)
      const repl = input.replacement.split(/\r?\n/)
      const after = lines.slice(actualStart)
      const combined = [...before, ...repl, ...after]
      const rehashedRaw = stripAllHashes(combined, prefix).join(eol)
      lines = formatFileWithHashes(rehashedRaw, hashLen, prefix === "" ? false : prefix, true).split(/\r?\n/)
      return { content: lines.join(eol), startLine: actualStart + 1, endLine: actualStart + 1 }
    }
    case "insert_after": {
      if (input.replacement === undefined) throw new HashlineError("MISSING_REPLACEMENT", input.startRef)
      const before = lines.slice(0, actualEnd + 1)
      const repl = input.replacement.split(/\r?\n/)
      const after = lines.slice(actualEnd + 1)
      const combined = [...before, ...repl, ...after]
      const rehashedRaw = stripAllHashes(combined, prefix).join(eol)
      lines = formatFileWithHashes(rehashedRaw, hashLen, prefix === "" ? false : prefix, true).split(/\r?\n/)
      return { content: lines.join(eol), startLine: actualEnd + 1, endLine: actualEnd + 1 }
    }
  }
}

const FILE_READ_TOOLS = ["read", "file_read", "read_file", "cat", "view"]
const FILE_EDIT_TOOLS = ["write", "file_write", "file_edit", "edit", "edit_file", "patch", "apply_patch", "multiedit", "batch"]

function isFileReadTool(toolName: string, args: Record<string, unknown> | undefined): boolean {
  const lower = toolName.toLowerCase()
  const nameMatch = FILE_READ_TOOLS.some(n => lower === n || lower.endsWith(`.${n}`))
  if (nameMatch) return true
  if (args && typeof args === "object") {
    if (typeof args.path === "string" || typeof args.filePath === "string" || typeof args.file === "string") {
      const writeIndicators = ["write", "edit", "patch", "execute", "run", "command", "shell", "bash"]
      const isWrite = writeIndicators.some(w => lower.includes(w))
      if (!isWrite) return true
    }
  }
  return false
}

const CONTENT_FIELDS = new Set([
  "content", "new_content", "old_content", "old_string", "new_string",
  "replacement", "text", "diff", "patch", "patchText", "body",
])

function stripDeep(obj: Record<string, unknown>) {
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (typeof val === "string" && CONTENT_FIELDS.has(key)) {
      obj[key] = stripHashes(val, config.prefix === false ? "" : config.prefix)
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          stripDeep(item as Record<string, unknown>)
        }
      }
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      stripDeep(val as Record<string, unknown>)
    }
  }
}

const SYSTEM_PROMPT = `## Hashline — Line Reference System

File contents are annotated with hashline prefixes in the format \`${DEFAULT_PREFIX}<line>:<hash>|<content>\`.
The hash length adapts to file size: 3 chars for files ≤4096 lines, 4 chars for larger files.

### Example (small file, 3-char hashes):
\`\`\`
${DEFAULT_PREFIX}1:a3f|function hello() {
${DEFAULT_PREFIX}2:f1c|  return "world";
${DEFAULT_PREFIX}3:0e7|}
\`\`\`

### Example (large file, 4-char hashes):
\`\`\`
${DEFAULT_PREFIX}1:a3f2|import { useState } from 'react';
${DEFAULT_PREFIX}2:f12c|
${DEFAULT_PREFIX}3:0e7a|export function App() {
\`\`\`

### How to reference lines:
You can reference specific lines using their hash tags (e.g., \`2:f1c\` or \`2:f12c\`).
When editing files, you may include or omit the hash prefixes — they will be stripped automatically.

### Edit operations using hash references:

**Preferred tool-based edit (hash-aware):**
- Use the \`hashline_edit\` tool with refs like \`startRef: "2:f1c"\` and optional \`endRef\`.
- This avoids fragile old_string matching because edits are resolved by hash references.

**Replace a single line:**
- "Replace line 2:f1c" — target a specific line unambiguously

**Replace a block of lines:**
- "Replace block from 1:a3f to 3:0e7" — replace a range of lines
- Example: replace lines 1:a3f through 3:0e7 with new content

**Insert content:**
- "Insert after 3:0e7" — insert new lines after a specific line
- "Insert before 1:a3f" — insert new lines before a specific line

**Delete lines:**
- "Delete lines from 2:f1c to 3:0e7" — remove a range of lines

### Hash verification rules:
- **Always verify** that the hash reference matches the current line content before editing.
- If a hash doesn't match, the file may have changed since you last read it — re-read the file first.
- Hash references include both the line number AND the content hash, so \`2:f1c\` means "line 2 with hash f1c".
- If you see a mismatch, do NOT proceed with the edit — re-read the file to get fresh references.

### File revision (\`${DEFAULT_PREFIX}REV:<hash>\`):
- When files are read, the first line may contain a file revision header: \`${DEFAULT_PREFIX}REV:<8-char-hex>\`.
- This is a hash of the entire file content. Pass it as the \`fileRev\` parameter to \`hashline_edit\` to verify the file hasn't changed.
- If the file was modified between read and edit, the revision check fails with \`FILE_REV_MISMATCH\` — re-read the file.

### Safe reapply (\`safeReapply\`):
- Pass \`safeReapply: true\` to \`hashline_edit\` to enable automatic line relocation.
- If a line moved (e.g., due to insertions above), safe reapply finds it by content hash.
- If exactly one match is found, the edit proceeds at the new location.
- If multiple matches exist, the edit fails with \`AMBIGUOUS_REAPPLY\` — re-read the file.

### Structured error codes:
- \`HASH_MISMATCH\` — line content changed since last read
- \`FILE_REV_MISMATCH\` — file was modified since last read
- \`AMBIGUOUS_REAPPLY\` — multiple candidate lines found during safe reapply
- \`TARGET_OUT_OF_RANGE\` — line number exceeds file length
- \`INVALID_REF\` — malformed hash reference
- \`INVALID_RANGE\` — start line is after end line
- \`MISSING_REPLACEMENT\` — replace/insert operation without replacement content

### Best practices:
- Use hash references for all edit operations to ensure precision.
- When making multiple edits, work from bottom to top to avoid line number shifts.
- For large replacements, use range references (e.g., \`1:a3f to 10:b2c\`) instead of individual lines.
- Use \`fileRev\` to guard against stale edits on critical files.
- Use \`safeReapply: true\` when editing files that may have shifted due to earlier edits.`

export default function (_pi: unknown) {
  const pi = _pi as {
    on: (event: string, handler: (...args: any[]) => any) => void
    registerTool: (def: {
      name: string
      label?: string
      description: string
      parameters: any
      execute: (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => Promise<{ content: { type: string; text: string }[]; details?: any }>
    }) => void
  }

  const processedCallIds = new BoundedSet(MAX_PROCESSED_IDS)

  // Register hashline_edit tool
  pi.registerTool({
    name: "hashline_edit",
    label: "Hashline Edit",
    description:
      "Edit files using hashline references. Resolves refs like 5:a3f or '#HL 5:a3f|...' and applies replace/delete/insert without old_string matching.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file (absolute or relative to project directory)" }),
      operation: Type.Enum({
        REPLACE: "replace",
        DELETE: "delete",
        INSERT_BEFORE: "insert_before",
        INSERT_AFTER: "insert_after",
      }, { description: "Edit operation" }),
      startRef: Type.String({ description: 'Start hash reference, e.g. "5:a3f" or "#HL 5:a3f|const x = 1;"' }),
      endRef: Type.Optional(Type.String({ description: "End hash reference for range operations. Defaults to startRef when omitted." })),
      replacement: Type.Optional(Type.String({ maxLength: 10_000_000, description: "Replacement/inserted content. Required for replace/insert operations." })),
      fileRev: Type.Optional(Type.String({ description: "File revision hash (8-char hex from #HL REV:<hash>). When provided, verifies the file hasn't changed before editing." })),
      safeReapply: Type.Optional(Type.Boolean({ description: "Enable safe reapply: if a line moved, attempt to find it by content hash. Fails on ambiguous matches." })),
    }),
    async execute(_toolCallId, args, _signal, _onUpdate, ctx) {
      const { path: argPath, operation, startRef, endRef, replacement, fileRev, safeReapply: safeReapplyArg } = args
      const cwd = ctx?.cwd ?? process.cwd()
      const absPath = isAbsolute(argPath) ? argPath : resolve(cwd, argPath)
      const realCwd = realpathSync(resolve(cwd))
      const displayPath = relative(cwd, absPath) || argPath

      function isWithin(filePath: string, dir: string): boolean {
        if (dir === sep) return false
        if (process.platform === "win32") {
          if (/^[A-Za-z]:\\$/.test(dir)) return false
          if (/^\\\\[^\\]+\\[^\\]+$/.test(dir)) return false
        }
        return filePath === dir || filePath.startsWith(dir + sep)
      }

      let realAbs: string
      try {
        realAbs = realpathSync(absPath)
      } catch {
        const parentDir = dirname(absPath)
        try { realpathSync(parentDir) } catch {
          throw new Error(`Access denied: cannot verify parent directory for "${argPath}"`)
        }
        if (!isWithin(realpathSync(parentDir), realCwd)) {
          throw new Error(`Access denied: "${argPath}" resolves outside the project directory`)
        }
        realAbs = resolve(absPath)
      }

      if (!isWithin(realAbs, realCwd)) {
        throw new Error(`Access denied: "${argPath}" resolves outside the project directory`)
      }

      let current: string
      try {
        current = readFileSync(realAbs, "utf-8")
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to read "${displayPath}": ${reason}`)
      }

      if (config.maxFileSize > 0 && getByteLength(current) > config.maxFileSize) {
        throw new Error(`File "${displayPath}" exceeds the configured maximum size (${config.maxFileSize} bytes)`)
      }

      const annotated = formatFileWithHashes(current, config.hashLength || undefined, config.prefix, config.fileRev)

      let nextContent: string
      let startLine: number
      let endLine: number
      try {
        const result = applyHashEdit(
          { operation, startRef, endRef, replacement, fileRev },
          annotated,
          config.hashLength || undefined,
          safeReapplyArg ?? config.safeReapply,
        )
        nextContent = result.content
        startLine = result.startLine
        endLine = result.endLine
      } catch (error: unknown) {
        if (error instanceof HashlineError) {
          throw new Error(`Hashline edit failed for "${displayPath}":\n${error.toDiagnostic()}`)
        }
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Hashline edit failed for "${displayPath}": ${reason}`)
      }

      // Strip hashes before writing — write raw content
      const rawContent = stripHashes(nextContent, config.prefix === false ? "" : config.prefix)

      try {
        writeFileSync(realAbs, rawContent, "utf-8")
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to write "${displayPath}": ${reason}`)
      }

      cache.invalidate(realAbs)
      cache.invalidate(absPath)
      if (argPath !== absPath) cache.invalidate(argPath)
      if (displayPath !== absPath) cache.invalidate(displayPath)

      const details = { path: displayPath, operation, startLine, endLine }
      return {
        content: [{ type: "text", text: [
          `Applied ${operation} to ${displayPath}.`,
          `Resolved range: ${startLine}-${endLine}.`,
          "Re-read the file to get fresh hash references before the next edit.",
        ].join("\n") }],
        details,
      }
    },
  })

  // Hook: annotate file reads with hashlines
  pi.on("tool_call", (event: any) => {
    if (event?.toolName !== "read") return
    const input = event.input as Record<string, unknown> | undefined
    if (!isFileReadTool("read", input)) return
  })

  pi.on("tool_result", (event: any) => {
    if (event?.callID) {
      if (processedCallIds.has(event.callID)) {
        debug("skipped: duplicate callID", event.callID)
        return
      }
      processedCallIds.add(event.callID)
    } else {
      debug("no callID — deduplication disabled for this call")
    }

    const toolName = event?.toolName as string | undefined
    if (!toolName) return
    if (!isFileReadTool(toolName, event?.input)) return

    const result = event?.result
    if (!result || typeof result.content !== "string" && !result?.output?.content) return

    const content = typeof result.content === "string" ? result.content : result.output?.content
    if (!content || typeof content !== "string") return

    debug("annotating read output, tool:", toolName, "input:", event?.input)

    if (config.maxFileSize > 0 && getByteLength(content) > config.maxFileSize) return

    const filePath = event?.input?.path || event?.input?.file || event?.input?.filePath
    if (typeof filePath === "string") {
      const cached = cache.get(filePath, content)
      if (cached) {
        if (typeof result.content === "string") {
          event.result.content = cached
        } else if (result.output) {
          event.result.output.content = cached
        }
        return
      }
    }

    const hashLen = getAdaptiveHashLength(content.split(/\r?\n/).length, config.hashLength || undefined)
    const annotated = formatFileWithHashes(content, hashLen, config.prefix, config.fileRev)

    if (typeof result.content === "string") {
      event.result.content = annotated
    } else if (result.output) {
      event.result.output.content = annotated
    }

    if (typeof filePath === "string") {
      cache.set(filePath, content, annotated)
    }
  })

  // Hook: strip hashes from file edits
  pi.on("tool_call", (event: any) => {
    if (event?.callID) {
      if (processedCallIds.has(event.callID)) return
      processedCallIds.add(event.callID)
    }

    const toolName = (event?.toolName as string | undefined)?.toLowerCase()
    if (!toolName) return

    const isFileEdit = FILE_EDIT_TOOLS.some(n => toolName === n || toolName.endsWith(`.${n}`))
    if (!isFileEdit) return

    const input = event.input as Record<string, unknown> | undefined
    if (!input || typeof input !== "object") return

    stripDeep(input)
  })

  // Hook: inject system prompt
  pi.on("context", (_event: any, output: any) => {
    if (output?.system && Array.isArray(output.system)) {
      output.system.push(SYSTEM_PROMPT)
    }
  })
}
