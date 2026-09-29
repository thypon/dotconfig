import { After, Before, setWorldConstructor } from "@cucumber/cucumber"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AUTO_FLAG, MANUAL_FLAG, createOConnection, stateDir } from "../../src/index"

export type HookRun = {
  promise: Promise<void>
  settled: boolean
  output: { headers: Record<string, string> }
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
    client: {
      app: {
        log: async (req: unknown) => {
          const body = (req as { body?: { level?: string; message?: string } }).body ?? {}
          world.logs.push({ level: body.level ?? "", message: body.message ?? "" })
        },
      },
    },
  })
}

export function providerStub(name: string, baseURL?: string) {
  const info: { id: string; options: Record<string, unknown> } = { id: name, options: {} }
  const provider: { info: typeof info; options: Record<string, unknown> } = {
    info,
    options: {},
  }
  if (baseURL) provider.options.baseURL = baseURL
  return provider
}

export function hookInput(provider: ReturnType<typeof providerStub>) {
  return {
    sessionID: "ses_test",
    agent: "build",
    model: {} as never,
    provider,
    message: {} as never,
  }
}

export function runHook(world: any, provider: ReturnType<typeof providerStub>) {
  const output = { headers: {} as Record<string, string> }
  const run: HookRun = {
    promise: Promise.resolve().then(() => {}), // replaced below
    settled: false,
    output,
  }
  const hook = world.plugin!["chat.headers"]
  const promise = (hook as (input: unknown, output: unknown) => Promise<void>)(
    hookInput(provider),
    output,
  ).then(
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