/** @jsxImportSource @opentui/solid */
// PR sidebar: link to the PR for the current branch (if any), links to
// brave/reviews security reviews found in the PR description (forward) or
// mentioning the PR (reverse search), falling back to the repo itself.
//
// NOTE: deliberately avoids importing @opencode/plugin/tui and @opentui/core.
// The opencode process embeds its own @opentui runtime; explicit imports of
// host-root copies re-initialize the native module and abort plugin load with
// "OPENTUI_FORCE_UNICODE is already registered". Use the plain setup(context)
// export shape (loop-live pattern) so the TUI loader injects its runtime.
//
// Rendering notes (learned the hard way against the embedded runtime):
// - the JSX <a> element from @opentui/solid crashes the render; the plain
//   <text> element with a `link={url}` prop does the same job (node.link =
//   { url }) and emits OSC 8 terminal hyperlinks.
// - the host invokes only the setup(context) entry; the legacy tui(api)
//   entry is never called for local plugins.

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { spawn } from "node:child_process"

// Open a URL in the browser from the TUI. The OSC 8 `link` prop below already
// makes terminal-native hyperlinks clickable where supported, but several
// terminals just copy on click instead, so wire an explicit mouse handler too.
function openUrl(url: string) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open"
  try {
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true })
    child.unref()
  } catch {
    // no-op: terminal may still handle the OSC 8 link
  }
}

// --- data fetching ----------------------------------------------------------

type GhResult = { code: number; stdout: string; stderr: string }

function runGh(args: string[], cwd: string): Promise<GhResult> {
  return new Promise((resolve) => {
    const child = spawn("gh", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    child.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()))
    child.stderr?.on("data", (chunk: Buffer) => (err += chunk.toString()))
    child.on("error", () => resolve({ code: -1, stdout: "", stderr: "spawn failed" }))
    child.on("close", (code) => resolve({ code: code ?? -1, stdout: out, stderr: err }))
  })
}

type PrInfo = { url: string; number: number; title: string }
type Link = { url: string; label: string }
type PrData = {
  pr: PrInfo | null
  reviews: Link[]
  repo: Link | null
}

// Forward: https://github.com/brave/reviews/... links inside the PR body.
const REVIEW_LINK_RE =
  /https?:\/\/github\.com\/brave\/reviews\/(?:pull|issues|discussions?)\/(\d+)(?:[^\s)\]}>.,]*)?/g

function reviewLabel(kind: "pull" | "issues" | "discussions", number_: string): string {
  const n = `#${number_}`
  if (kind === "pull") return `↳ review PR ${n}`
  if (kind === "discussions") return `↳ review discussion ${n}`
  return `↳ review ${n}`
}

// --- caches (keyed per cwd / pr url, avoid hammering gh) ---------------------

const PR_TTL_MS = 20_000
const REVERSE_TTL_MS = 10 * 60_000 // search API rate limit: 30/min

type CacheEntry<T> = { ts: number; data: T }
const prCache = new Map<string, CacheEntry<PrData>>()
const reverseCache = new Map<string, CacheEntry<Link[]>>()

function cached<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) return hit.data
  return null
}

// Reverse search: find brave/reviews issues (security reviews) that mention
// this PR's URL. `gh api -X GET search/issues -f q='repo:brave/reviews "<url>"'`
async function reverseSearch(prUrl: string): Promise<Link[]> {
  const hit = cached(reverseCache, prUrl, REVERSE_TTL_MS)
  if (hit) return hit
  const res = await runGh(
    ["api", "-X", "GET", "search/issues", "-f", `q=repo:brave/reviews "${prUrl}"`],
    process.cwd(),
  )
  if (res.code !== 0) return []
  let items: Array<{ number: number; title: string; html_url: string }> = []
  try {
    items = JSON.parse(res.stdout)?.items ?? []
  } catch {
    return []
  }
  const links = items.map((item) => ({
    url: item.html_url,
    label: `↳ review #${item.number} ${truncate(item.title, 40)}`,
  }))
  reverseCache.set(prUrl, { ts: Date.now(), data: links })
  return links
}

async function fetchPrData(cwd: string): Promise<PrData | null> {
  const hit = cached(prCache, cwd, PR_TTL_MS)
  if (hit) return hit

  const prRes = await runGh(["pr", "view", "--json", "url,number,title,body"], cwd)

  if (prRes.code === 0) {
    let parsed: (PrInfo & { body?: string }) | null = null
    try {
      parsed = JSON.parse(prRes.stdout)
    } catch {
      parsed = null
    }
    if (parsed?.url && parsed?.number) {
      const { body, ...pr } = parsed
      const seen = new Set<string>()
      const reviews: Link[] = []
      if (body) {
        for (const match of body.matchAll(REVIEW_LINK_RE)) {
          if (seen.has(match[1])) continue
          seen.add(match[1])
          const kind = match[0].includes("/discussions")
            ? "discussions"
            : match[0].includes("/pull")
              ? "pull"
              : "issues"
          reviews.push({
            url: match[0].replace(/[)\]}>.,;]+$/, ""),
            label: reviewLabel(kind, match[1]),
          })
        }
      }
      // Reverse: reviews mentioning this PR that the body does not list.
      const mentioned = await reverseSearch(pr.url)
      for (const link of mentioned) {
        const num = /(?:pull|issues|discussions?)\/(\d+)/.exec(link.url)?.[1]
        if (num && seen.has(num)) continue
        reviews.push(link)
      }
      const data: PrData = { pr, reviews, repo: null }
      prCache.set(cwd, { ts: Date.now(), data })
      return data
    }
  }

  // Fallback: no PR on this branch — link the repo itself.
  const repoRes = await runGh(["repo", "view", "--json", "url"], cwd)
  if (repoRes.code === 0) {
    try {
      const url = JSON.parse(repoRes.stdout)?.url
      if (typeof url === "string" && url) {
        const label = url.replace(/^https?:\/\/github\.com\//, "") || url
        const data: PrData = { pr: null, reviews: [], repo: { url, label } }
        prCache.set(cwd, { ts: Date.now(), data })
        return data
      }
    } catch {
      // fall through
    }
  }
  // gh missing, not a repo, or unauthenticated: render nothing.
  prCache.set(cwd, { ts: Date.now(), data: { pr: null, reviews: [], repo: null } })
  return null
}

// --- rendering ---------------------------------------------------------------

function truncate(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function PRView(props: { sessionID: string; theme: () => Record<string, string> }) {
  const [data, setData] = createSignal<PrData | null>(null)

  createEffect(() => {
    const sessionID = props.sessionID
    let cancelled = false
    let lastFetch = 0
    const refresh = async () => {
      if (Date.now() - lastFetch < PR_TTL_MS) return
      lastFetch = Date.now()
      const cwd = sessionCwd(sessionID)
      if (!cwd) return
      const next = await fetchPrData(cwd)
      if (!cancelled) setData(next)
    }
    void refresh()
    const timer = setInterval(() => void refresh(), PR_TTL_MS)
    onCleanup(() => {
      cancelled = true
      clearInterval(timer)
    })
  })

  return (
    <Show when={data() && (data()!.pr || data()!.repo)}>
      <box>
        <text fg={props.theme().base}>{data()!.pr ? "PR" : "REPO"}</text>
        <Show when={data()!.pr}>
          <text
            link={data()!.pr!.url}
            onMouseDown={() => openUrl(data()!.pr!.url)}
            fg={props.theme().base}
          >
            {`#${data()!.pr!.number} ${truncate(data()!.pr!.title, 34)}`}
          </text>
          <For each={data()!.reviews}>
            {(link) => (
              <text
                link={link.url}
                onMouseDown={() => openUrl(link.url)}
                fg={props.theme().muted}
              >
                {link.label}
              </text>
            )}
          </For>
        </Show>
        <Show when={!data()!.pr && data()!.repo}>
          <text
            link={data()!.repo!.url}
            onMouseDown={() => openUrl(data()!.repo!.url)}
            fg={props.theme().muted}
          >
            {`⌂ ${data()!.repo!.label}`}
          </text>
        </Show>
      </box>
    </Show>
  )
}

// session cwd lookup, injected at setup() since it needs the live context
let sessionCwd: (sessionID: string) => string | undefined = () => undefined

// v2 TUI plugin API
function setup(context: any) {
  sessionCwd = (sessionID: string) =>
    context.data?.session?.get?.(sessionID)?.location?.directory?.trim()

  context.ui.slot({
    append: "sidebar.content",
    render: (props: { sessionID: string }) => {
      const theme = () => context.theme?.text ?? {}
      return <PRView sessionID={props.sessionID} theme={theme} />
    },
  })
  return () => {}
}

const plugin = { id: "local.pr-sidebar.tui", setup }
export default plugin
