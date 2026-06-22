import type { Plugin } from "@opencode-ai/plugin"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { homedir } from "os"
import { join } from "path"
import { readFileSync } from "fs"

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search"
const MAX_RESULTS = 20
const FRESHNESS_OPTIONS = ["auto", "pd", "pw", "pm", "py"] as const

const KEY_FILE = join(homedir(), ".config", "opencode", "brave-search-api-key")

function getApiKey(): string | null {
  const envKey = process.env.BRAVE_API_KEY
  if (envKey) return envKey
  try {
    return readFileSync(KEY_FILE, "utf8").trim()
  } catch {}
  return null
}

interface BraveWebResult {
  title: string
  url: string
  description?: string
  age?: string
  language?: string
  family_friendly?: boolean
  source?: string
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
  query?: { original: string }
}

async function braveSearch(
  query: string,
  count: number,
  freshness?: string,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return "Error: BRAVE_API_KEY not set. Set it in env or .env"
  }

  const url = new URL(BRAVE_API)
  url.searchParams.set("q", query)
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), MAX_RESULTS)))
  if (freshness && freshness !== "auto") {
    url.searchParams.set("freshness", freshness)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    })
  } catch (e) {
    return `Error: Network failure — ${e instanceof Error ? e.message : String(e)}`
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return `Error: Brave API ${res.status}${body ? ` — ${body.slice(0, 500)}` : ""}`
  }

  let data: BraveSearchResponse
  try {
    data = (await res.json()) as BraveSearchResponse
  } catch {
    return "Error: Failed to parse Brave Search response"
  }

  const results = data.web?.results ?? []
  if (results.length === 0) {
    return `No results for "${query}". Try a different query.`
  }

  const lines: string[] = [
    `## Brave Search: "${data.query?.original ?? query}"`,
    "",
  ]
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    lines.push(`${i + 1}. [${r.title}](${r.url})`)
    if (r.description) lines.push(`   ${r.description}`)
    if (r.age) lines.push(`   _Age: ${r.age}_`)
    if (r.language && r.language !== "en") lines.push(`   _Lang: ${r.language}_`)
    lines.push("")
  }

  return lines.join("\n")
}

const brave_websearch: ToolDefinition = tool({
  description:
    "Search the web using Brave Search. " +
    "Returns ranked web results with titles, URLs, descriptions, and age. " +
    "Use for current events, docs, research — anything beyond training data.",
  args: {
    query: tool.schema.string().describe("Search query"),
    count: tool.schema.number().optional().describe("Results count (1-20, default 10)"),
    freshness: tool.schema
      .enum(FRESHNESS_OPTIONS)
      .optional()
      .describe(
        "Time filter: auto (default), pd (past day), pw (past week), pm (past month), py (past year)",
      ),
  },
  execute: async (args, ctx) => {
    const output = await braveSearch(
      args.query,
      args.count ?? 10,
      args.freshness,
    )
    ctx.metadata({ metadata: { output } })
    return output
  },
})

export default (async () => {
  if (!getApiKey()) {
    console.error("[brave-search] BRAVE_API_KEY not set, tool disabled")
    return {}
  }

  console.error("[brave-search] registered, tool: brave_websearch")
  return { tool: { brave_websearch } }
}) satisfies Plugin