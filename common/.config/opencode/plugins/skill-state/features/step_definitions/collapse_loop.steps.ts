import { Given, Then, When } from "@cucumber/cucumber"
import { Registry } from "../../src/registry"
import { createSkillState } from "../../src/index"
import { assistantMsg, padding, toolPart, userMsg, type WithParts } from "./support"

const X = "run-loop-cmd"

function bashPart(cmd: string, reasoning?: string): WithParts {
  const opts: { text?: string; reasoning?: string; toolParts?: any[] } = {
    toolParts: [{ type: "tool", callID: `c-${cmd}-${Math.random()}`, tool: "bash", state: { status: "completed", output: "out", input: { command: cmd } } }],
  }
  if (reasoning) opts.reasoning = reasoning
  return assistantMsg("ses", `a-${cmd}-${Math.random()}`, opts)
}

function countToolMsgs(msgs: WithParts[]): number {
  return msgs.filter((m) => m.info.role === "assistant" && m.parts.some((p) => p.type === "tool")).length
}

function countUsers(msgs: WithParts[]): number {
  return msgs.filter((m) => m.info.role === "user" && !(m.parts.length === 1 && (m.parts[0] as any).text?.includes("skill spec"))).length
}

function countReasoning(msgs: WithParts[]): number {
  return msgs.reduce((n, m) => n + m.parts.filter((p) => p.type === "reasoning").length, 0)
}

Given("a history of assistant turns with distinct bash commands", function () {
  this.messages = [userMsg(this.sessionID, "m-spec", "skill spec")]
  for (const cmd of ["cmd-a", "cmd-b", "cmd-c"]) {
    this.messages.push(userMsg(this.sessionID, `u-${cmd}`, `obs ${cmd}`))
    this.messages.push(bashPart(cmd))
  }
  // drop non-spec users so distinct scenario stays minimal: rebuild without users
  this.messages = [this.messages[0], ...this.messages.slice(1).filter((m: WithParts) => m.info.role === "assistant")]
})

Given("a history ending with the same bash command twice", function () {
  this.messages = [
    userMsg(this.sessionID, "m-spec", "skill spec"),
    userMsg(this.sessionID, "u1", "obs 1"),
    bashPart(X, "think 1"),
    bashPart(X, "think 2"),
  ]
})

When("the messages transform hook fires {int} times, each time appending one more repeated bash command", { timeout: 30000 }, async function (times: number) {
  this.loopSeq = this.loopSeq ?? 0
  this.fullHistory = this.fullHistory ?? [userMsg(this.sessionID, "m-spec", "skill spec"), bashPart(X, "think 0")]
  for (let i = 0; i < times; i++) {
    this.loopSeq++
    this.fullHistory.push(userMsg(this.sessionID, `u-loop-${this.loopSeq}`, `obs ${this.loopSeq}`))
    this.fullHistory.push(bashPart(X, `think ${this.loopSeq}`))
    this.messages = JSON.parse(JSON.stringify(this.fullHistory)) as WithParts[]
    await this.hooks["experimental.chat.messages.transform"]({}, { messages: this.messages })
  }
})

Given("the loop exponent is preset to {int}", async function (n: number) {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  const st0 = await this.hooks.registry.activate(this.sessionID)
  st0.loopCount = n
  await this.hooks.registry.save(st0)
})

Then("the state records loop exponent {int}", async function (n: number) {
  const registry = new (await import("../../src/registry")).Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if ((st?.loopCount ?? 0) !== n) throw new Error(`loop exponent ${st?.loopCount} != ${n}`)
})

Then("the lookback contains {int} command messages", function (n: number) {
  const got = countToolMsgs(this.messages)
  if (got !== n) throw new Error(`expected ${n} command messages, got ${got}`)
})

Then("{int} user messages were added back", function (n: number) {
  const got = countUsers(this.messages)
  if (got !== n) throw new Error(`expected ${n} user messages added back, got ${got}`)
})

Then("no user messages were added back", function () {
  if (countUsers(this.messages) !== 0) throw new Error(`expected 0 users, got ${countUsers(this.messages)}`)
})

Then("no reasoning parts were added back", function () {
  if (countReasoning(this.messages) !== 0) throw new Error(`expected 0 reasoning, got ${countReasoning(this.messages)}`)
})

Then("{int} reasoning parts were added back", function (n: number) {
  const got = countReasoning(this.messages)
  if (got !== n) throw new Error(`expected ${n} reasoning parts, got ${got}`)
})

// ---- tool similarity + decay ----

function genericToolPart(tool: string, args: Record<string, unknown>, reasoning?: string): WithParts {
  const opts: { text?: string; reasoning?: string; toolParts?: any[] } = {
    toolParts: [{ type: "tool", callID: `c-${tool}-${Math.random()}`, tool, state: { status: "completed", output: "out", input: args } }],
  }
  if (reasoning) opts.reasoning = reasoning
  return assistantMsg("ses", `a-${tool}-${Math.random()}`, opts)
}

Given("a history ending with tool calls {string} {json} then {string} {json}", function (t1: string, a1: Record<string, unknown>, t2: string, a2: Record<string, unknown>) {
  this.messages = [
    userMsg(this.sessionID, "m-spec", "skill spec"),
    genericToolPart(t1, a1),
    genericToolPart(t2, a2),
  ]
})

Given("a history ending with 3 tool calls {string} {json} then {string} {json} then {string} {json}", function (t1: string, a1: Record<string, unknown>, t2: string, a2: Record<string, unknown>, t3: string, a3: Record<string, unknown>) {
  this.messages = [
    userMsg(this.sessionID, "m-spec", "skill spec"),
    genericToolPart(t1, a1),
    genericToolPart(t2, a2),
    genericToolPart(t3, a3),
  ]
})

When("{int} clean iterations fire with distinct tool calls", { timeout: 60000 }, async function (times: number) {
  this.cleanSeq = this.cleanSeq ?? 0
  this.fullHistory = this.fullHistory ?? [userMsg(this.sessionID, "m-spec", "skill spec")]
  for (let i = 0; i < times; i++) {
    this.cleanSeq++
    this.fullHistory.push(userMsg(this.sessionID, `u-clean-${this.cleanSeq}`, `obs ${this.cleanSeq}`))
    const cleanSeq = ["cat readme.md", "docker ps -a", "git push origin main"]
    this.fullHistory.push(genericToolPart("bash", { command: cleanSeq[this.cleanSeq % 3] }))
    this.messages = JSON.parse(JSON.stringify(this.fullHistory)) as WithParts[]
    await this.hooks["experimental.chat.messages.transform"]({}, { messages: this.messages })
  }
})

Given("a history ending with the same command with outputs {string} then {string}", function (out1: string, out2: string) {
  const mk = (id: string, output: string) =>
    assistantMsg("ses", `a-out-${Math.random()}`, { toolParts: [toolPart(`c-${id}-${Math.random()}`, "bash", output, { command: X })] })
  this.messages = [userMsg(this.sessionID, "m-spec", "skill spec"), mk("a-1", out1), mk("a-2", out2)]
})
