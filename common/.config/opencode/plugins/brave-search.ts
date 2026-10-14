import { Plugin } from "@opencode/plugin"
import { homedir } from "os"
import { join } from "path"
import { readFileSync } from "fs"

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search"
const MAX_RESULTS = 20

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
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
  query?: { original: string }
}

export default Plugin.define({
  id: "brave-search",
  async setup(ctx) {
    const apiKey = getApiKey()
    if (!apiKey) {
      console.error("[brave-search] BRAVE_API_KEY not set, provider disabled")
      return
    }

    await ctx.websearch.transform((editor) => {
      editor.add({
        id: "brave",
        name: "Brave",
        execute: async ({ query }, { signal }) => {
          const url = new URL(BRAVE_API)
          url.searchParams.set("q", query)
          url.searchParams.set("count", String(MAX_RESULTS))

          const res = await fetch(url.toString(), {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": apiKey,
            },
            signal,
          })

          if (!res.ok) {
            const body = await res.text().catch(() => "")
            throw new Error(`Brave API ${res.status}${body ? ` — ${body.slice(0, 500)}` : ""}`)
          }

          const data = (await res.json()) as BraveSearchResponse
          const results = data.web?.results ?? []
          return results.map((r) => ({
            url: r.url,
            title: r.title,
            content: [r.description, r.age ? `Age: ${r.age}` : ""].filter(Boolean).join("\n"),
            time: {},
          }))
        },
      })
      editor.default.set("brave")
    })

    console.error("[brave-search] websearch provider 'brave' registered as default")
  },
})