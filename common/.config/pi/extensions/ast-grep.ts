import { Type } from "typebox"

const CLI_LANGUAGES = [
  "bash", "c", "cpp", "csharp", "css", "elixir", "go", "haskell",
  "html", "java", "javascript", "json", "kotlin", "lua", "nix",
  "php", "python", "ruby", "rust", "scala", "solidity", "swift",
  "typescript", "tsx", "yaml",
] as const

type CliLanguage = (typeof CLI_LANGUAGES)[number]

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024
const DEFAULT_MAX_MATCHES = 500

interface Position {
  line: number
  column: number
}

interface CliMatch {
  text: string
  range: { byteOffset: { start: number; end: number }; start: Position; end: Position }
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
  const { spawnSync } = require("child_process")
  const proc = spawnSync("sg", ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
  if (proc.status === 0 && proc.stdout.toString().includes("ast-grep")) {
    return "sg"
  }
  const candidates = ["/opt/homebrew/bin/sg", "/usr/local/bin/sg"]
  for (const p of candidates) {
    const check = spawnSync(p, ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
    if (check.status === 0 && check.stdout.toString().includes("ast-grep")) {
      return p
    }
  }
  return null
}

async function runSg(options: RunOptions): Promise<SgResult> {
  if (!sgPath) {
    return { matches: [], totalMatches: 0, truncated: false, error: "ast-grep not found" }
  }

  const { spawn } = require("child_process")
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

  const paths = options.paths && options.paths.length > 0 ? options.paths : ["."]
  args.push(...paths)

  return new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      resolve({ matches: [], totalMatches: 0, truncated: true, truncatedReason: "timeout" })
    }, DEFAULT_TIMEOUT_MS)

    proc.on("close", (exitCode: number) => {
      clearTimeout(timeout)

      if (exitCode !== 0 && stdout.trim() === "") {
        if (stderr.includes("No files found")) {
          resolve({ matches: [], totalMatches: 0, truncated: false })
          return
        }
        if (stderr.trim()) {
          resolve({ matches: [], totalMatches: 0, truncated: false, error: stderr.trim() })
          return
        }
        resolve({ matches: [], totalMatches: 0, truncated: false })
        return
      }

      if (!stdout.trim()) {
        resolve({ matches: [], totalMatches: 0, truncated: false })
        return
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
              const commaIdx = outputToProcess.lastIndexOf("},")
              if (commaIdx > 0) {
                const truncatedJson = outputToProcess.substring(0, commaIdx + 1) + "]"
                matches = JSON.parse(truncatedJson)
              }
            }
          } catch {
            resolve({
              matches: [],
              totalMatches: 0,
              truncated: true,
              truncatedReason: "max_output_bytes",
              error: "Output too large and could not be parsed",
            })
            return
          }
        } else {
          resolve({ matches: [], totalMatches: 0, truncated: false })
          return
        }
      }

      const totalMatches = matches.length
      const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES
      const finalMatches = matchesTruncated ? matches.slice(0, DEFAULT_MAX_MATCHES) : matches

      resolve({
        matches: finalMatches,
        totalMatches,
        truncated: outputTruncated || matchesTruncated,
        truncatedReason: outputTruncated
          ? "max_output_bytes"
          : matchesTruncated
            ? "max_matches"
            : undefined,
      })
    })
  })
}

function formatSearchResult(result: SgResult): string {
  if (result.error) return `Error: ${result.error}`
  if (result.matches.length === 0) return "No matches found"

  const lines: string[] = []

  if (result.truncated) {
    const reason =
      result.truncatedReason === "max_matches"
        ? `showing first ${result.matches.length} of ${result.totalMatches}`
        : result.truncatedReason === "max_output_bytes"
          ? "output exceeded 1MB limit"
          : "search timed out"
    lines.push(`[TRUNCATED] Results truncated (${reason})\n`)
  }

  lines.push(
    `Found ${result.matches.length} match(es)${result.truncated ? ` (truncated from ${result.totalMatches})` : ""}:\n`
  )

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
    const reason =
      result.truncatedReason === "max_matches"
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

export default function astGrepExtension(pi: any) {
  sgPath = findSg()

  if (!sgPath) {
    console.error("[ast-grep] sg not found, tools disabled")
    return
  }

  console.error(`[ast-grep] using sg at ${sgPath}`)

  pi.registerTool({
    name: "ast_grep_search",
    label: "AST Grep Search",
    description:
      "Search code patterns across filesystem using AST-aware matching. Supports 25 languages. " +
      "Use meta-variables: $VAR (single node), $$$ (multiple nodes). " +
      "IMPORTANT: Patterns must be complete AST nodes (valid code). " +
      "For functions, include params and body: 'export async function $NAME($$$) { $$$ }' not 'export async function $NAME'. " +
      "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern with meta-variables ($VAR, $$$). Must be complete AST node." }),
      lang: Type.String({ description: "Target language" }),
      paths: Type.Optional(Type.Array(Type.String(), { description: "Paths to search (default: ['.'])" })),
      globs: Type.Optional(Type.Array(Type.String(), { description: "Include/exclude globs (prefix ! to exclude)" })),
      context: Type.Optional(Type.Number({ description: "Context lines around match" })),
    }),
    async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      try {
        const result = await runSg({
          pattern: params.pattern,
          lang: params.lang as CliLanguage,
          paths: params.paths,
          globs: params.globs,
          context: params.context,
        })

        let output = formatSearchResult(result)

        if (result.matches.length === 0 && !result.error) {
          const hint = getEmptyResultHint(params.pattern, params.lang as CliLanguage)
          if (hint) output += `\n\n${hint}`
        }

        return { content: output }
      } catch (e) {
        return { content: `Error: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  })

  pi.registerTool({
    name: "ast_grep_replace",
    label: "AST Grep Replace",
    description:
      "Replace code patterns across filesystem with AST-aware rewriting. " +
      "Applies changes immediately. Use dryRun=true to preview. " +
      "Use meta-variables in rewrite to preserve matched content. " +
      "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to match" }),
      rewrite: Type.String({ description: "Replacement pattern (can use $VAR from pattern)" }),
      lang: Type.String({ description: "Target language" }),
      paths: Type.Optional(Type.Array(Type.String(), { description: "Paths to search" })),
      globs: Type.Optional(Type.Array(Type.String(), { description: "Include/exclude globs" })),
      dryRun: Type.Optional(Type.Boolean({ description: "Preview changes without applying (default: false)" })),
    }),
    async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      try {
        const result = await runSg({
          pattern: params.pattern,
          rewrite: params.rewrite,
          lang: params.lang as CliLanguage,
          paths: params.paths,
          globs: params.globs,
          updateAll: params.dryRun !== true,
        })
        return { content: formatReplaceResult(result, params.dryRun === true) }
      } catch (e) {
        return { content: `Error: ${e instanceof Error ? e.message : String(e)}` }
      }
    },
  })
}
