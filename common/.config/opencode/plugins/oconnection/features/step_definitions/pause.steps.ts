import { Given, Then, When } from "@cucumber/cucumber"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AUTO_FLAG, EVENTS_LOG, MANUAL_FLAG, ROTATE_BYTES } from "../../src/index"
import { flagPath, gateEvent, makePlugin, makePluginWithDefaults, runHook, until } from "./support"

Given("a fresh state dir", function () {
  this.files = new Set()
  this.hooks = []
  this.logs = []
  this.sleepCount = 0
})

Given("the plugin is created", async function () {
  this.plugin = await makePlugin(this)
})

Given("the default-logger plugin is created", async function () {
  this.plugin = await makePluginWithDefaults(this)
})

Given("the event log exceeds the rotation limit", function () {
  writeFileSync(join(this.dir, EVENTS_LOG), "x".repeat(ROTATE_BYTES + 1))
})

Given("the pause flag exists", function () {
  this.files.add(flagPath(this.dir, MANUAL_FLAG))
})

Given("the auto pause flag exists", function () {
  this.files.add(flagPath(this.dir, AUTO_FLAG))
})

Given("no pause flag exists", function () {
  this.files.clear()
})

When('an http.request hook runs for provider {string}', function (name: string) {
  runHook(this, gateEvent(name))
})

When(
  'an http.request hook runs for provider {string} against {string}',
  function (name: string, url: string) {
    runHook(this, gateEvent(name, url))
  },
)

When("http.request hooks run for {int} requests", function (n: number) {
  for (let i = 0; i < n; i++) runHook(this, gateEvent("openrouter"))
})

When("the pause flag is removed", function () {
  this.files.delete(flagPath(this.dir, MANUAL_FLAG))
})

When("the auto pause flag is removed", function () {
  this.files.delete(flagPath(this.dir, AUTO_FLAG))
})

Then("the hook is still held after {int} polls", async function (polls: number) {
  const run = this.hooks[this.hooks.length - 1]
  await until(() => this.sleepCount >= polls)
  if (run.settled) throw new Error("hook returned while the pause flag exists")
})

Then("the hook returns", async function () {
  const run = this.hooks[this.hooks.length - 1]
  await until(() => run.settled)
})

Then("all held hooks return", async function () {
  await until(() => this.hooks.every((run: { settled: boolean }) => run.settled))
})

Then("the hook returns without polling", async function () {
  const run = this.hooks[this.hooks.length - 1]
  await until(() => run.settled)
  if (this.sleepCount > 0) {
    throw new Error(`gate polled ${this.sleepCount} time(s) for a local provider`)
  }
})

Then("the manual pause flag does not exist", function () {
  if (this.files.has(flagPath(this.dir, MANUAL_FLAG))) {
    throw new Error("manual pause flag exists")
  }
})

Then("the request is unchanged", function () {
  const run = this.hooks[this.hooks.length - 1]
  const headers = [...run.event.request.headers.entries()]
  if (headers.length !== 1 || headers[0]![0] !== "content-type") {
    throw new Error(`gate mutated the request headers: ${JSON.stringify(headers)}`)
  }
})

Then("the gate logged a hold and a release", function () {
  const messages = this.logs.map((entry: { message: string }) => entry.message)
  if (!messages.some((m: string) => m.includes("request held"))) {
    throw new Error("no hold log; logs: " + JSON.stringify(messages))
  }
  if (!messages.some((m: string) => m.includes("request released"))) {
    throw new Error("no release log; logs: " + JSON.stringify(messages))
  }
})

function readEvents(dir: string): Record<string, unknown>[] {
  const path = join(dir, EVENTS_LOG)
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

Then("the event log records a hold with the request url", function () {
  const entries = readEvents(this.dir)
  const hold = entries.find((e) => String(e.message).includes("request held"))
  if (!hold) throw new Error("no held entry; entries: " + JSON.stringify(entries))
  const run = this.hooks[this.hooks.length - 1]
  if (hold.url !== run.event.request.url) {
    throw new Error(`held url ${hold.url} != ${run.event.request.url}`)
  }
  if (hold.sessionID !== run.event.sessionID || hold.provider !== "openrouter") {
    throw new Error(`bad held identity: ${JSON.stringify(hold)}`)
  }
  if (typeof hold.ts !== "string") throw new Error("held entry missing ts")
})

Then("the event log records a release with waitMs", function () {
  const entries = readEvents(this.dir)
  const release = entries.find((e) => String(e.message).includes("request released"))
  if (!release) throw new Error("no released entry; entries: " + JSON.stringify(entries))
  if (typeof release.waitMs !== "number") {
    throw new Error(`release waitMs not a number: ${JSON.stringify(release)}`)
  }
})

Then("the event log rotated", function () {
  const rotated = join(this.dir, EVENTS_LOG + ".1")
  const info = statSync(rotated)
  if (info.size !== ROTATE_BYTES + 1) {
    throw new Error(`rotated log size ${info.size} != ${ROTATE_BYTES + 1}`)
  }
})