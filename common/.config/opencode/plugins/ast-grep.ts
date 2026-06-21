import { spawn, spawnSync } from "bun"
import type { Plugin } from "@opencode-ai/plugin"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

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
  const proc = spawnSync(["sg", "--version"], { stdout: "pipe", stderr: "pipe" })
  if (proc.exitCode === 0 && proc.stdout.toString().includes("ast-grep")) {
    return "sg"
  }

  const candidates = ["/opt/homebrew/bin/sg", "/usr/local/bin/sg"]
  for (const p of candidates) {
    const check = spawnSync([p, "--version"], { stdout: "pipe", stderr: "pipe" })
    if (check.exitCode === 0 && check.stdout.toString().includes("ast-grep")) {
      return p
    }
  }

  return null
}

async function runSg(options: RunOptions): Promise<SgResult> {
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

  const proc = spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  })

  const timeout = setTimeout(() => proc.kill(), DEFAULT_TIMEOUT_MS)

  const exitCode = await proc.exited
  clearTimeout(timeout)

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

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

const ast_grep_search: ToolDefinition = tool({
  description:
    "Search code patterns across filesystem using AST-aware matching. Supports 25 languages. " +
    "Use meta-variables: $VAR (single node), $$$ (multiple nodes). " +
    "IMPORTANT: Patterns must be complete AST nodes (valid code). " +
    "For functions, include params and body: 'export async function $NAME($$$) { $$$ }' not 'export async function $NAME'. " +
    "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern with meta-variables ($VAR, $$$). Must be complete AST node."),
    lang: tool.schema.enum(CLI_LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search (default: ['.'])"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Include/exclude globs (prefix ! to exclude)"),
    context: tool.schema.number().optional().describe("Context lines around match"),
  },
  execute: async (args, ctx) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        context: args.context,
      })

      let output = formatSearchResult(result)

      if (result.matches.length === 0 && !result.error) {
        const hint = getEmptyResultHint(args.pattern, args.lang as CliLanguage)
        if (hint) output += `\n\n${hint}`
      }

      ctx.metadata({ metadata: { output } })
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      ctx.metadata({ metadata: { output } })
      return output
    }
  },
})

const ast_grep_replace: ToolDefinition = tool({
  description:
    "Replace code patterns across filesystem with AST-aware rewriting. " +
    "Applies changes immediately. Use dryRun=true to preview. " +
    "Use meta-variables in rewrite to preserve matched content. " +
    "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    rewrite: tool.schema.string().describe("Replacement pattern (can use $VAR from pattern)"),
    lang: tool.schema.enum(CLI_LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Include/exclude globs"),
    dryRun: tool.schema.boolean().optional().describe("Preview changes without applying (default: false)"),
  },
  execute: async (args, ctx) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        rewrite: args.rewrite,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        updateAll: args.dryRun !== true,
      })
      const output = formatReplaceResult(result, args.dryRun === true)
      ctx.metadata({ metadata: { output } })
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      ctx.metadata({ metadata: { output } })
      return output
    }
  },
})

export default (async () => {
  sgPath = findSg()

  if (!sgPath) {
    console.error("[ast-grep] sg not found, tool disabled")
    return {}
  }

  console.error(`[ast-grep] using sg at ${sgPath}`)

  return {
    tool: { ast_grep_search, ast_grep_replace },
  }
}) satisfies Plugin
