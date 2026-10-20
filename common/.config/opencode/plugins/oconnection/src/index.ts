import { Plugin } from "@opencode/plugin"
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { join } from "node:path"

export const MANUAL_FLAG = "paused"
export const AUTO_FLAG = "paused.auto"
export const EVENTS_LOG = "events.log"
export const ROTATE_BYTES = 524288

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

// JSONL event writer shared with the oconnection CLI: every gate event lands
// in $STATE_DIR/events.log as {"ts","level","message",...extra}. Rotates to
// events.log.1 past ROTATE_BYTES so the file cannot grow unbounded. Also
// mirrors to console.error for interactive runs.
export function fileLogger(dir: string, consoleMirror = true) {
  const path = join(dir, EVENTS_LOG)
  return (level: string, message: string, extra: Record<string, unknown> = {}) => {
    try {
      mkdirSync(dir, { recursive: true })
      try {
        if (statSync(path).size > ROTATE_BYTES) renameSync(path, path + ".1")
      } catch {
        // no existing log yet
      }
      appendFileSync(
        path,
        JSON.stringify({ ts: new Date().toISOString(), level, message, ...extra }) + "\n",
      )
    } catch (err) {
      console.error(`[oconnection] log write failed: ${err}`)
    }
    if (consoleMirror) {
      console.error(`[oconnection] ${level}: ${message}`, extra ?? "")
    }
  }
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
  const log = opts.log ?? fileLogger(dir)

  const held = () => exists(join(dir, MANUAL_FLAG)) || exists(join(dir, AUTO_FLAG))

  return {
    paused: held,
    // Runs as the V2 session "http.request" hook before the native provider
    // HTTP dispatch. Awaiting here holds the request indefinitely, keeping the
    // client pending until the flag disappears. Polling (not fs.watch) so the
    // gate survives sleep/wake.
    "http.request": async (event: GateEvent): Promise<void> => {
      if (isLocalRequest(event)) return
      const started = Date.now()
      let waited = false
      while (held()) {
        if (!waited) {
          waited = true
          await log("info", "oconnection: request held (travel pause)", {
            sessionID: event.sessionID,
            provider: event.model?.providerID,
            url: event.request?.url,
          })
        }
        await sleep(pollMs)
      }
      if (waited) {
        await log("info", "oconnection: request released", {
          sessionID: event.sessionID,
          provider: event.model?.providerID,
          waitMs: Date.now() - started,
        })
      }
    },
  }
}

export default Plugin.define({
  id: "oconnection",
  async setup(ctx) {
    fileLogger(stateDir())("info", "oconnection: plugin registered", {
      gate: "http.request",
      stateDir: stateDir(),
    })
    const gate = await createOConnection()
    await ctx.session.hook("http.request", gate["http.request"] as never)
  },
})