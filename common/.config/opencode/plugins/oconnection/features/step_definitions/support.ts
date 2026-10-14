import { After, Before, setWorldConstructor } from "@cucumber/cucumber"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AUTO_FLAG, MANUAL_FLAG, createOConnection, stateDir } from "../../src/index"

export type GateEvent = {
  sessionID: string
  model: { providerID: string }
  request: Request
}

export type HookRun = {
  promise: Promise<void>
  settled: boolean
  event: GateEvent
}

export class OConnectionWorld {
  dir: string = ""
  files: Set<string> = new Set()
  sleepCount = 0
  plugin: Awaited<ReturnType<typeof createOConnection>> | null = null
  hooks: HookRun[] = []
  logs: Array<{ level: string; message: string }> = []
}

setWorldConstructor(OConnectionWorld)

Before(async function () {
  this.dir = await mkdtemp(join(tmpdir(), "oconnection-"))
})

After(async function () {
  // Drain dangling gate loops so the cucumber process can exit.
  this.files.clear()
  try {
    await until(() => this.hooks.every((run: { settled: boolean }) => run.settled), 2000)
  } catch {
    // timed out — reported by the scenario's own assertions
  }
  await rm(this.dir, { recursive: true, force: true })
})

export function flagPath(dir: string, flag: typeof MANUAL_FLAG | typeof AUTO_FLAG): string {
  return join(dir, flag)
}

export async function until(
  cond: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not reached in time")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

export async function makePlugin(world: any) {
  return createOConnection({
    stateDir: world.dir,
    pollMs: 0,
    exists: (path: string) => world.files.has(path),
    sleep: async () => {
      world.sleepCount++
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    log: async (level: string, message: string, extra?: Record<string, unknown>) => {
      world.logs.push({ level, message: extra ? `${message} ${JSON.stringify(extra)}` : message })
    },
  })
}

export function gateEvent(providerID: string, url?: string): GateEvent {
  return {
    sessionID: "ses_test",
    model: { providerID },
    request: new Request(url ?? "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  }
}

export function runHook(world: any, event: GateEvent) {
  const run: HookRun = {
    promise: Promise.resolve(),
    settled: false,
    event,
  }
  const hook = world.plugin!["http.request"]
  const promise = (hook as (input: GateEvent) => Promise<void>)(event).then(
    () => {
      run.settled = true
    },
    () => {
      run.settled = true
    },
  )
  run.promise = promise
  world.hooks.push(run)
  return run
}

export { stateDir }