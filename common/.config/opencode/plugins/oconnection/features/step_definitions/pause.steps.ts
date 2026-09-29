import { Given, Then, When } from "@cucumber/cucumber"
import { AUTO_FLAG, MANUAL_FLAG } from "../../src/index"
import { flagPath, makePlugin, providerStub, runHook, until } from "./support"

Given("a fresh state dir", function () {
  this.files = new Set()
  this.hooks = []
  this.logs = []
  this.sleepCount = 0
})

Given("the plugin is created", async function () {
  this.plugin = await makePlugin(this)
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

When('a chat.headers hook runs for provider {string}', function (name: string) {
  runHook(this, providerStub(name))
})

When(
  'a chat.headers hook runs for a remote provider with baseURL {string}',
  function (baseURL: string) {
    runHook(this, providerStub("openrouter", baseURL))
  },
)

When("chat.headers hooks run for {int} requests", function (n: number) {
  for (let i = 0; i < n; i++) runHook(this, providerStub("openrouter"))
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

Then("the output headers are unchanged", function () {
  const run = this.hooks[this.hooks.length - 1]
  if (Object.keys(run.output.headers).length > 0) {
    throw new Error("gate mutated the output headers")
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