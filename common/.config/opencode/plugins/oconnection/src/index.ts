import { Plugin } from "@opencode/plugin"
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

// V2 http.request hook event: native provider request before dispatch.
export type GateEvent = {
  sessionID?: string
  model?: { providerID?: string }
  request?: { url?: string }
}

// Local inference servers keep working while traveling: no gate.
export function isLocalRequest(event: GateEvent): boolean {
  if (event.model?.providerID === "ds4") return true
  const url = event.request?.url
  if (typeof url === "string" && LOOPBACK.test(url)) return true
  return false
}

export async function createOConnection(
  opts: {
    stateDir?: string
    pollMs?: number
    exists?: (path: string) => boolean
    sleep?: (ms: number) => Promise<void>
    log?: (level: string, message: string, extra?: Record<string, unknown>) => Promise<void> | void
  } = {},
) {
  const dir = opts.stateDir ?? stateDir()
  const pollMs = opts.pollMs ?? 500
  const exists = opts.exists ?? ((path: string) => existsSync(path))
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const log =
    opts.log ??
    ((level: string, message: string, extra?: Record<string, unknown>) => {
      console.error(`[oconnection] ${level}: ${message}`, extra ?? "")
    })

  const held = () => exists(join(dir, MANUAL_FLAG)) || exists(join(dir, AUTO_FLAG))

  return {
    paused: held,
    // Runs as the V2 session "http.request" hook before the native provider
    // HTTP dispatch. Awaiting here holds the request indefinitely, keeping the
    // client pending until the flag disappears. Polling (not fs.watch) so the
    // gate survives sleep/wake.
    "http.request": async (event: GateEvent): Promise<void> => {
      if (isLocalRequest(event)) return
      let waited = false
      while (held()) {
        if (!waited) {
          waited = true
          await log("info", "oconnection: request held (travel pause)", {
            sessionID: event.sessionID,
            provider: event.model?.providerID,
          })
        }
        await sleep(pollMs)
      }
      if (waited) {
        await log("info", "oconnection: request released", { sessionID: event.sessionID })
      }
    },
  }
}

export default Plugin.define({
  id: "oconnection",
  async setup(ctx) {
    console.error("[oconnection] registered, gate: http.request, state dir: " + stateDir())
    const gate = await createOConnection()
    await ctx.session.hook("http.request", gate["http.request"] as never)
  },
})