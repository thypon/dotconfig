import type { Plugin } from "@opencode-ai/plugin"
import { existsSync } from "node:fs"
import { join } from "node:path"

export const MANUAL_FLAG = "paused"
export const AUTO_FLAG = "paused.auto"

// Mirrors the CLI's default: ${XDG_STATE_HOME:-$HOME/.local/state}/oconnection
export function defaultStateDir(): string {
  const home = process.env.HOME ?? ""
  return join(process.env.XDG_STATE_HOME || join(home, ".local", "state"), "oconnection")
}

export function stateDir(): string {
  return process.env.OCONNECTION_STATE_DIR || defaultStateDir()
}

const LOOPBACK = /localhost|127\.0\.0\.1|\[::1\]/i

// Shape-compatible subset of the chat.headers ProviderContext
// ({ source, info: Provider, options }) so tests can pass stubs.
export type ProviderLike = {
  info?: { id?: string; options?: Record<string, unknown> }
  options?: Record<string, unknown>
}

// Local inference servers keep working while traveling: no gate.
export function isLocalProvider(provider: ProviderLike | undefined): boolean {
  if (provider?.info?.id === "ds4") return true
  for (const url of [provider?.options?.baseURL, provider?.info?.options?.baseURL]) {
    if (typeof url === "string" && LOOPBACK.test(url)) return true
  }
  return false
}

export async function createOConnection(
  opts: {
    stateDir?: string
    pollMs?: number
    client?: unknown
    exists?: (path: string) => boolean
    sleep?: (ms: number) => Promise<void>
  } = {},
) {
  const dir = opts.stateDir ?? stateDir()
  const pollMs = opts.pollMs ?? 500
  const exists = opts.exists ?? ((path: string) => existsSync(path))
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const client = opts.client as { app?: { log?: (req: unknown) => Promise<unknown> } } | undefined
  const log = async (level: string, message: string, extra?: Record<string, unknown>) => {
    try {
      await client?.app?.log?.({ body: { service: "oconnection", level, message, extra } })
    } catch {
      // logging must never break the runtime
    }
  }

  const held = () => exists(join(dir, MANUAL_FLAG)) || exists(join(dir, AUTO_FLAG))

  return {
    paused: held,
    // Runs inside LLMRequestPrep.prepare before the HTTP request is assembled.
    // Awaiting here holds the request indefinitely (no timeout wraps hooks),
    // keeping the TUI pending until the flag disappears. Polling (not fs.watch)
    // so the gate survives sleep/wake.
    "chat.headers": async (
      input: { sessionID?: string; provider?: ProviderLike },
      output?: { headers?: Record<string, string> },
    ) => {
      void output
      if (isLocalProvider(input.provider)) return
      let waited = false
      while (held()) {
        if (!waited) {
          waited = true
          await log("info", "oconnection: request held (travel pause)", {
            sessionID: input.sessionID,
            provider: input.provider?.info?.id,
          })
        }
        await sleep(pollMs)
      }
      if (waited) {
        await log("info", "oconnection: request released", { sessionID: input.sessionID })
      }
    },
  }
}

export default (async ({ client }) => {
  console.error("[oconnection] registered, gate: chat.headers, state dir: " + stateDir())
  return createOConnection({ client })
}) satisfies Plugin