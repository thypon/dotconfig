import { Type } from "typebox"
import { homedir } from "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search"
const MAX_RESULTS = 20
const FRESHNESS_OPTIONS = ["auto", "pd", "pw", "pm", "py"] as const

const KEY_FILE = join(homedir(), ".config", "opencode", "brave-search-api-key")

function getApiKey(): string | null {
  const envKey = process.env.BRAVE_API_KEY
  if (envKey) return envKey
  try {
    return readFileSync(KEY_FILE, "utf8").trim()
  } catch {
    return null
  }
}

async function braveSearch(query: string, count: number, freshness?: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return "Error: BRAVE_API_KEY not set. Set it in env or ~/.config/opencode/brave-search-api-key"
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

  type BraveWebResult = { title: string; url: string; description?: string; age?: string; language?: string }
  type BraveSearchResponse = { web?: { results?: BraveWebResult[] }; query?: { original: string } }

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

  const lines: string[] = [`## Brave Search: "${data.query?.original ?? query}"`, ""]
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

export default async function braveSearchExtension(pi: any) {
  if (!getApiKey()) {
    console.error("[brave-search] BRAVE_API_KEY not set, tool disabled")
    return
  }

  pi.registerTool({
    name: "brave_websearch",
    label: "Brave Web Search",
    description:
      "Search the web using Brave Search. Returns ranked web results with titles, URLs, descriptions, and age. " +
      "Use for current events, docs, research — anything beyond training data.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      count: Type.Optional(Type.Number({ description: "Results count (1-20, default 10)" })),
      freshness: Type.Optional(
        Type.Union(FRESHNESS_OPTIONS.map((o) => Type.Literal(o)), {
          description:
            "Time filter: auto (default), pd (past day), pw (past week), pm (past month), py (past year)",
        })
      ),
    }),
    async execute(toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) {
      const output = await braveSearch(params.query, params.count ?? 10, params.freshness)
      return { content: [{ type: "text", text: output }] }
    },
  })

  console.error("[brave-search] registered")
}
