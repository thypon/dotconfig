/** @jsxImportSource @opentui/solid */
// Live loop sidebar for the opencode loop plugin.
//
// The upstream loop-plugin TUI sidebar derives its data from the last
// loop-tool part in the session transcript (a frozen snapshot). Scheduler
// runs inject via promptAsync and carry no tool parts, so its countdown
// clamps to "next in 00s" between tool calls. This companion reads the
// scheduler state file directly and re-renders every second.

import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

type LoopSnapshot = {
  id: string
  sessionID: string
  mode: "interval" | "dynamic"
  intervalMs: number | null
  status: "active" | "paused" | "stopped" | "completed"
  nextRunAt: number | null
  runCount: number
  maxRuns: number | null
}

function stateFile() {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local/share")
  return join(dataHome, "opencode-loop-plugin", "loops.json")
}

function readLoops(): LoopSnapshot[] {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), "utf8"))
    const loops = raw?.loops
    if (Array.isArray(loops)) return loops as LoopSnapshot[]
    if (loops && typeof loops === "object") return Object.values(loops) as LoopSnapshot[]
  } catch {
    // state file missing or mid-atomic-rename: render nothing this tick
  }
  return []
}

function formatInterval(ms: number | null) {
  if (ms == null) return "dynamic"
  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
    [1000, "s"],
  ]
  for (const [size, suffix] of units) {
    if (ms >= size && ms % size === 0) return `${ms / size}${suffix}`
  }
  return `${Math.round(ms / 1000)}s`
}

function formatCountdown(msFromNow: number) {
  const total = Math.max(0, Math.ceil(msFromNow / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`
  return `${seconds}s`
}

function loopLine(loop: LoopSnapshot, nowMs: number) {
  const cadence = loop.mode === "interval" ? `every ${formatInterval(loop.intervalMs)}` : "dynamic"
  const runs = `runs ${loop.runCount}${loop.maxRuns == null ? "" : `/${loop.maxRuns}`}`
  let next = ""
  if (loop.status === "active") {
    next = loop.nextRunAt != null ? `, next in ${formatCountdown(loop.nextRunAt - nowMs)}` : ", awaiting schedule"
  }
  return `${loop.id} ${cadence}, ${runs}${next}`
}

function LiveSidebar(props: { sessionID: string; base: string; muted: string }) {
  const [loops, setLoops] = createSignal(readLoops())
  const [nowMs, setNowMs] = createSignal(Date.now())
  const timer = setInterval(() => {
    setLoops(readLoops())
    setNowMs(Date.now())
  }, 1000)
  onCleanup(() => clearInterval(timer))
  const open = createMemo(() =>
    loops().filter(
      (loop) => loop.sessionID === props.sessionID && (loop.status === "active" || loop.status === "paused"),
    ),
  )
  return (
    <Show when={open().length > 0}>
      <box>
        <text fg={props.base}>Loops</text>
        <For each={open()}>
          {(loop) => (
            <text fg={props.muted}>
              {loop.status === "paused" ? "⏸ " : ""}
              {loopLine(loop, nowMs())}
            </text>
          )}
        </For>
      </box>
    </Show>
  )
}

// v1 TUI plugin API
async function tui(api: any) {
  api.slots?.register?.({
    order: 127,
    slots: {
      sidebar_content(_ctx: unknown, props: { session_id: string }) {
        const theme = api.theme?.current ?? {}
        return <LiveSidebar sessionID={props.session_id} base={theme.text} muted={theme.textMuted} />
      },
    },
  })
}

// v2 TUI plugin API
function setup(context: any) {
  context.ui.slot({
    append: "sidebar.content",
    render: (props: { sessionID: string }) => {
      const theme = context.theme?.text ?? {}
      return <LiveSidebar sessionID={props.sessionID} base={theme.base} muted={theme.muted} />
    },
  })
  return () => {}
}

const plugin = { id: "local.loop-live.tui", tui, setup }
export default plugin