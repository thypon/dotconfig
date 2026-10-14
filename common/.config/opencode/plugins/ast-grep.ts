import { Plugin } from "@opencode/plugin"
import { spawn, spawnSync } from "child_process"

const CLI_LANGUAGES = [
  "bash", "c", "cpp", "csharp", "css", "elixir", "go", "haskell",
  "html", "java", "javascript", "json", "kotlin", "lua", "nix",
  "php", "python", "ruby", "rust", "scala", "solidity", "swift",
  "typescript", "tsx", "yaml",
] as const

type CliLanguage = typeof CLI_LANGUAGES[number]

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024
const DEFAULT_MAX_MATCHES = 500

interface Position {
  line: number
  column: number
}

interface CliMatch {
  text: string
  range: {
    byteOffset: { start: number; end: number }
    start: Position
    end: Position
  }
  file: string
  lines: string
  language: string
}

interface SgResult {
  matches: CliMatch[]
  totalMatches: number
  truncated: boolean
  truncatedReason?: "max_matches" | "max_output_bytes" | "timeout"
  error?: string
}

interface RunOptions {
  pattern: string
  lang: CliLanguage
  paths?: string[]
  globs?: string[]
  rewrite?: string
  updateAll?: boolean
  context?: number
}

let sgPath: string | null = null

function findSg(): string | null {
  const proc = spawnSync("sg", ["--version"], { encoding: "utf8" })
  if (proc.status === 0 && proc.stdout.includes("ast-grep")) {
    return "sg"
  }

  const candidates = ["/opt/homebrew/bin/sg", "/usr/local/bin/sg"]
  for (const p of candidates) {
    const check = spawnSync(p, ["--version"], { encoding: "utf8" })
    if (check.status === 0 && check.stdout.includes("ast-grep")) {
      return p
    }
  }

  return null
}

async function runSg(options: RunOptions, signal?: AbortSignal): Promise<SgResult> {
  if (!sgPath) {
    return { matches: [], totalMatches: 0, truncated: false, error: "ast-grep not found" }
  }

  const args: string[] = [sgPath, "run", "-p", options.pattern, "--lang", options.lang, "--json=compact"]

  if (options.rewrite) {
    args.push("-r", options.rewrite)
    if (options.updateAll) args.push("--update-all")
  }

  if (options.context && options.context > 0) {
    args.push("-C", String(options.context))
  }

  if (options.globs) {
    for (const glob of options.globs) {
      args.push("--globs", glob)
    }
  }

  const paths = (options.paths && options.paths.length > 0) ? options.paths : ["."]
  args.push(...paths)

  const proc = spawn(args[0], args.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
  })

  // Attach stream readers immediately at spawn; after `exit` the streams may
  // already be closed and `end` would never fire (plugin hung doing this).
  let stdout = ""
  let stderr = ""
  proc.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
  proc.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()))

  const timeout = setTimeout(() => proc.kill(), DEFAULT_TIMEOUT_MS)
  const onAbort = () => proc.kill()
  signal?.addEventListener("abort", onAbort, { once: true })

  let exitCode: number | null
  try {
    // `close` = process exited AND stdio flushed — safe to read buffers now.
    exitCode = await new Promise<number | null>((resolve) => {
      proc.on("close", (code) => resolve(code))
      proc.on("error", () => resolve(-1))
    })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", onAbort)
  }

  if (exitCode !== 0 && stdout.trim() === "") {
    if (stderr.includes("No files found")) {
      return { matches: [], totalMatches: 0, truncated: false }
    }
    if (stderr.trim()) {
      return { matches: [], totalMatches: 0, truncated: false, error: stderr.trim() }
    }
    return { matches: [], totalMatches: 0, truncated: false }
  }

  if (!stdout.trim()) {
    return { matches: [], totalMatches: 0, truncated: false }
  }

  const outputTruncated = stdout.length >= DEFAULT_MAX_OUTPUT_BYTES
  const outputToProcess = outputTruncated ? stdout.substring(0, DEFAULT_MAX_OUTPUT_BYTES) : stdout

  let matches: CliMatch[] = []
  try {
    matches = JSON.parse(outputToProcess)
  } catch {
    if (outputTruncated) {
      try {
        const lastBracket = outputToProcess.lastIndexOf("}")
        if (lastBracket > 0) {
          const commaIdx = outputToProcess.lastIndexOf("},", lastBracket)
          if (commaIdx > 0) {
            const truncatedJson = outputToProcess.substring(0, commaIdx + 1) + "]"
            matches = JSON.parse(truncatedJson)
          }
        }
      } catch {
        return {
          matches: [], totalMatches: 0, truncated: true,
          truncatedReason: "max_output_bytes",
          error: "Output too large and could not be parsed",
        }
      }
    } else {
      return { matches: [], totalMatches: 0, truncated: false }
    }
  }

  const totalMatches = matches.length
  const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES
  const finalMatches = matchesTruncated ? matches.slice(0, DEFAULT_MAX_MATCHES) : matches

  return {
    matches: finalMatches,
    totalMatches,
    truncated: outputTruncated || matchesTruncated,
    truncatedReason: outputTruncated
      ? "max_output_bytes"
      : matchesTruncated
      ? "max_matches"
      : undefined,
  }
}

function formatSearchResult(result: SgResult): string {
  if (result.error) return `Error: ${result.error}`
  if (result.matches.length === 0) return "No matches found"

  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `showing first ${result.matches.length} of ${result.totalMatches}`
      : result.truncatedReason === "max_output_bytes"
      ? "output exceeded 1MB limit"
      : "search timed out"
    lines.push(`[TRUNCATED] Results truncated (${reason})\n`)
  }

  lines.push(`Found ${result.matches.length} match(es)${result.truncated ? ` (truncated from ${result.totalMatches})` : ""}:\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    if (match.lines) lines.push(`  ${match.lines.trim()}`)
    lines.push("")
  }

  return lines.join("\n")
}

function formatReplaceResult(result: SgResult, isDryRun: boolean): string {
  if (result.error) return `Error: ${result.error}`
  if (result.matches.length === 0) return "No matches found to replace"

  const prefix = isDryRun ? "[DRY RUN] " : ""
  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `showing first ${result.matches.length} of ${result.totalMatches}`
      : result.truncatedReason === "max_output_bytes"
      ? "output exceeded 1MB limit"
      : "search timed out"
    lines.push(`[TRUNCATED] Results truncated (${reason})\n`)
  }

  lines.push(`${prefix}${result.matches.length} replacement(s):\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    if (match.text) lines.push(`  ${match.text}`)
    lines.push("")
  }

  if (isDryRun) {
    lines.push("Use dryRun=false to apply changes")
  }

  return lines.join("\n")
}

export default Plugin.define({
  id: "ast-grep",
  async setup(ctx) {
    sgPath = findSg()

    if (!sgPath) {
      console.error("[ast-grep] sg not found, tool disabled")
      return
    }

    console.error(`[ast-grep] using sg at ${sgPath}`)

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "ast_grep_search",
        description:
          "AST-aware code pattern search, 25 languages. Meta-variables: $VAR (single node), $$$ (multiple). " +
          "Patterns must be complete AST nodes: 'async function $NAME($$$) { $$$ }'. " +
          "Examples: 'console.log($MSG)', 'def $FUNC($$$):'",
        input: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "AST pattern with meta-variables ($VAR, $$$). Must be complete AST node." },
            lang: { type: "string", enum: [...CLI_LANGUAGES], description: "Target language" },
            paths: { type: "array", items: { type: "string" }, description: "Paths to search (default: ['.'])" },
            globs: { type: "array", items: { type: "string" }, description: "Include/exclude globs (prefix ! to exclude)" },
            context: { type: "number", description: "Context lines around match" },
          },
          required: ["pattern", "lang"],
          additionalProperties: false,
        },
        execute: async (args, toolCtx) => {
          const a = args as {
            pattern: string
            lang: CliLanguage
            paths?: string[]
            globs?: string[]
            context?: number
          }
          try {
            const result = await runSg(a, toolCtx?.signal)
            let output = formatSearchResult(result)
            if (result.matches.length === 0 && !result.error) {
              const hint = getEmptyResultHint(a.pattern, a.lang)
              if (hint) output += `\n\n${hint}`
            }
            return { content: output }
          } catch (e) {
            return { content: `Error: ${e instanceof Error ? e.message : String(e)}` }
          }
        },
      })

      editor.add({
        name: "ast_grep_replace",
        description:
          "AST-aware pattern replace, applies immediately; dryRun=true previews. " +
          "Meta-variables preserve matched content. Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
        input: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "AST pattern to match" },
            rewrite: { type: "string", description: "Replacement pattern (can use $VAR from pattern)" },
            lang: { type: "string", enum: [...CLI_LANGUAGES], description: "Target language" },
            paths: { type: "array", items: { type: "string" }, description: "Paths to search" },
            globs: { type: "array", items: { type: "string" }, description: "Include/exclude globs" },
            dryRun: { type: "boolean", description: "Preview changes without applying (default: false)" },
          },
          required: ["pattern", "rewrite", "lang"],
          additionalProperties: false,
        },
        execute: async (args, toolCtx) => {
          const a = args as {
            pattern: string
            rewrite: string
            lang: CliLanguage
            paths?: string[]
            globs?: string[]
            dryRun?: boolean
          }
          try {
            const result = await runSg(
              {
                pattern: a.pattern,
                rewrite: a.rewrite,
                lang: a.lang,
                paths: a.paths,
                globs: a.globs,
                updateAll: a.dryRun !== true,
              },
              toolCtx?.signal,
            )
            return { content: formatReplaceResult(result, a.dryRun === true) }
          } catch (e) {
            return { content: `Error: ${e instanceof Error ? e.message : String(e)}` }
          }
        },
      })
    })
  },
})

function getEmptyResultHint(pattern: string, lang: CliLanguage): string | null {
  const src = pattern.trim()

  if (lang === "python") {
    if (src.startsWith("class ") && src.endsWith(":"))
      return `Hint: Remove trailing colon. Try: "${src.slice(0, -1)}"`
    if ((src.startsWith("def ") || src.startsWith("async def ")) && src.endsWith(":"))
      return `Hint: Remove trailing colon. Try: "${src.slice(0, -1)}"`
  }

  if (["javascript", "typescript", "tsx"].includes(lang)) {
    if (/^(export\s+)?(async\s+)?function\s+\$[A-Z_]+\s*$/i.test(src)) {
      return `Hint: Function patterns need params and body. Try "function $NAME($$$) { $$$ }"`
    }
  }

  return null
}