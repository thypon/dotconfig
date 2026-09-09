import { Given, Then, When } from "@cucumber/cucumber"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Registry } from "../../src/registry"
import { merge } from "../../src/merge"
import { createSkillState } from "../../src/index"
import { assistantMsg, padding, toolPart, userMsg, type PartLike, type WithParts } from "./support"

const parse = (s: string) => JSON.parse(s) as Record<string, unknown>

async function activate(world: any, pMessageID?: string) {
  const registry = new Registry(world.stateDir)
  await registry.activate(world.sessionID, pMessageID)
  world.hooks = await createSkillState({ stateDir: world.stateDir })
  return registry
}

async function fireTransform(world: any) {
  await world.hooks["experimental.chat.messages.transform"]({}, { messages: world.messages })
}

Given("execution state:", function (sigmaJson: string) {
  this.sigma = parse(sigmaJson)
})

When("a patch is merged:", function (patchJson: string) {
  const result = merge(this.sigma!, parse(patchJson))
  this.mergeResult = result
  if (result.ok) this.sigma = result.sigma
})

When("a scalar patch {string} is merged", function (scalar: string) {
  const result = merge(this.sigma!, scalar)
  this.mergeResult = result
  if (result.ok) this.sigma = result.sigma
})

When("a patch with a {int} byte string value is merged", function (bytes: number) {
  const result = merge(this.sigma!, { big: padding(bytes) })
  this.mergeResult = result
  if (result.ok) this.sigma = result.sigma
})

Then("the merge is accepted", function () {
  if (!this.mergeResult?.ok) throw new Error(`merge rejected: ${this.mergeResult?.error}`)
})

Then("the merge is rejected", function () {
  if (this.mergeResult?.ok) throw new Error("merge unexpectedly accepted")
})

Then("the state is:", function (expectedJson: string) {
  const actual = JSON.stringify(this.sigma)
  const expected = JSON.stringify(parse(expectedJson))
  if (actual !== expected) throw new Error(`state mismatch:\n  actual:   ${actual}\n  expected: ${expected}`)
})

Given("an active skill-state session", async function () {
  await activate(this)
})

const DISJOINT_CMDS = ["cat readme.md", "docker ps -a", "git push origin main"]

Given("a {int}-message history of assistant turns with {int} character padding", function (count: number, pad: number) {
  const msgs: WithParts[] = [userMsg(this.sessionID, "m-spec", `skill spec ${padding(pad)}`)]
  for (let i = 1; i < count; i++) {
    msgs.push(
      assistantMsg(this.sessionID, `a${i}`, {
        text: `step ${i} reasoning ${padding(pad)}`,
        reasoning: `thinking ${padding(pad)}`,
        toolParts: [toolPart(`c${i}`, "bash", `output ${i} ${padding(pad)}`, { command: DISJOINT_CMDS[i % 3] })],
      }),
    )
  }
  this.messages = msgs
})

Given("a history of spec message, text-only assistant message, and new user observation", function () {
  this.messages = [
    userMsg(this.sessionID, "m-spec", "skill spec"),
    assistantMsg(this.sessionID, "a1", { text: "final answer" }),
    userMsg(this.sessionID, "u2", "new user observation"),
  ]
})

When("the messages transform hook fires", async function () {
  if (!this.hooks) await activate(this, "m-spec")
  await fireTransform(this)
})

When("the messages transform hook fires {int} times, each time appending one more assistant turn with {int} character padding", async function (times: number, pad: number) {
  if (!this.hooks) await activate(this, "m-spec")
  // opencode re-hydrates the FULL history from the DB before every LLM call;
  // simulate that by handing the hook a fresh copy of the growing history each iteration
  const fullHistory: WithParts[] = [userMsg(this.sessionID, "m-spec", `skill spec ${padding(pad)}`)]
  for (let i = 1; i <= times; i++) {
    fullHistory.push(
      assistantMsg(this.sessionID, `a${i}`, {
        text: `step ${i} reasoning ${padding(pad)}`,
        toolParts: [toolPart(`c${i}`, "bash", `output ${i} ${padding(pad)}`, { command: DISJOINT_CMDS[i % 3] })],
      }),
    )
    this.messages = JSON.parse(JSON.stringify(fullHistory)) as WithParts[]
    await fireTransform(this)
  }
})

Then("the same array instance holds {int} messages", function (count: number) {
  if (this.messages.length !== count) {
    throw new Error(`expected ${count} messages, got ${this.messages.length}: ${JSON.stringify(this.messages.map((m: WithParts) => [m.info.role, m.parts.map((p: PartLike) => p.type)]))}`)
  }
})

Then("the first message is the specification message", function () {
  if (this.messages[0]?.info.id !== "m-spec") throw new Error(`first message is ${this.messages[0]?.info.id}`)
})

Then("the last message is the latest assistant message with only tool and step parts", function () {
  const last = this.messages[this.messages.length - 1]
  if (last.info.role !== "assistant") throw new Error(`last message role is ${last.info.role}`)
  const bad = last.parts.filter((p: PartLike) => !["tool", "step-start", "step-finish"].includes(p.type))
  if (bad.length > 0) throw new Error(`unexpected parts: ${bad.map((p: PartLike) => p.type).join(",")}`)
  if (!last.parts.some((p: PartLike) => p.type === "tool")) throw new Error("no tool parts kept")
})

Then("no text or reasoning parts remain on the assistant message", function () {
  const last = this.messages[this.messages.length - 1]
  const bad = last.parts.filter((p: PartLike) => p.type === "text" || p.type === "reasoning")
  if (bad.length > 0) throw new Error(`ephemeral parts kept: ${bad.map((p: PartLike) => p.type).join(",")}`)
})

Then("the messages are the specification message and the new user observation", function () {
  if (this.messages.map((m: WithParts) => m.info.id).join(",") !== "m-spec,u2")
    throw new Error(`unexpected messages: ${this.messages.map((m: WithParts) => m.info.id).join(",")}`)
})

Then("the state records iterations {int}", function (n: number) {
  const registry = new Registry(this.stateDir)
  return registry.get(this.sessionID).then((st) => {
    if (st?.iterations !== n) throw new Error(`iterations ${st?.iterations} != ${n}`)
  })
})

Then("the state records tokensOriginal greater than tokensSent", async function () {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (!(st!.tokensOriginal > st!.tokensSent))
    throw new Error(`tokensOriginal ${st!.tokensOriginal} not > tokensSent ${st!.tokensSent}`)
})

Then("tokensOriginal divided by tokensSent is greater than {int}", async function (ratio: number) {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  const actual = st!.tokensOriginal / st!.tokensSent
  if (!(actual > ratio)) throw new Error(`ratio ${actual.toFixed(2)} not > ${ratio}`)
})

Given("an active session with specification message {string}", async function (messageID: string) {
  await activate(this, messageID)
})

Given("an active session with sigma:", async function (sigmaJson: string) {
  const registry = await activate(this)
  const st = await registry.get(this.sessionID)
  st!.sigma = parse(sigmaJson)
  await registry.save(st!)
})

When("a user message {string} with text {string} arrives", async function (messageID: string, text: string) {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  await this.hooks["chat.message"](
    { sessionID: this.sessionID, messageID },
    { message: { id: messageID, role: "user", sessionID: this.sessionID }, parts: [{ type: "text", text }] },
  )
})

When("the {string} command executes with message id {string}", async function (command: string, messageID: string) {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  await this.hooks["command.execute.before"]({ command, sessionID: this.sessionID, arguments: "", messageID }, { parts: [] })
})

When("the {string} command executes", async function (command: string) {
  await this.hooks["command.execute.before"]({ command, sessionID: this.sessionID, arguments: "" }, { parts: [] })
})

Then("the session is active", async function () {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (!st?.active) throw new Error("session is not active")
})

Then("the session is inactive", async function () {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (!st || st.active) throw new Error("session is active or missing")
})

Then("no session state exists", async function () {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (st) throw new Error("session state unexpectedly exists")
})

Then("the specification message id is {string}", async function (messageID: string) {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (st?.pMessageID !== messageID) throw new Error(`pMessageID ${st?.pMessageID} != ${messageID}`)
})

Then("the specification message id is still {string}", async function (messageID: string) {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (st?.pMessageID !== messageID) throw new Error(`pMessageID ${st?.pMessageID} != ${messageID}`)
})

When("skill_state_patch is called with:", async function (patchJson: string) {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.toolResult = (await this.hooks.tool.skill_state_patch.execute({ patch: parse(patchJson) }, { sessionID: this.sessionID })) as string
})

When("skill_state_patch is called with a {int} byte string value", async function (bytes: number) {
  this.toolResult = (await this.hooks.tool.skill_state_patch.execute({ patch: { big: padding(bytes) } }, { sessionID: this.sessionID })) as string
})

When("skill_state_patch is called with the raw string:", async function (raw: string) {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.toolResult = (await this.hooks.tool.skill_state_patch.execute({ patch: raw as never }, { sessionID: this.sessionID })) as string
})

When("skill_state_complete is called", async function () {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.toolResult = (await this.hooks.tool.skill_state_complete.execute({}, { sessionID: this.sessionID })) as string
})

When("skill_state_show is called", async function () {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.toolResult = (await this.hooks.tool.skill_state_show.execute({}, { sessionID: this.sessionID })) as string
})

Then("the tool result contains {string}", function (fragment: string) {
  if (!this.toolResult?.includes(fragment))
    throw new Error(`tool result "${this.toolResult}" does not contain "${fragment}"`)
})

Then("the state file on disk has sigma:", async function (expectedJson: string) {
  const registry = new Registry(this.stateDir)
  const raw = await readFile(registry.pathFor(this.sessionID), "utf8")
  const st = JSON.parse(raw) as { sigma: Record<string, unknown> }
  const actual = JSON.stringify(st.sigma)
  const expected = JSON.stringify(parse(expectedJson))
  if (actual !== expected) throw new Error(`disk sigma mismatch:\n  actual:   ${actual}\n  expected: ${expected}`)
})

Then("the state records errors {int}", async function (n: number) {
  const registry = new Registry(this.stateDir)
  const st = await registry.get(this.sessionID)
  if (st?.errors !== n) throw new Error(`errors ${st?.errors} != ${n}`)
})

Then("the state file exists on disk", function () {
  const registry = new Registry(this.stateDir)
  return readFile(registry.pathFor(this.sessionID)).then(
    () => {},
    () => {
      throw new Error("state file missing")
    },
  )
})

When("a new registry instance is created over the same state directory", function () {
  this.registry2 = new Registry(this.stateDir)
})

Then("the session is active with sigma:", async function (expectedJson: string) {
  const st = await this.registry2.get(this.sessionID)
  if (!st?.active) throw new Error("session not active after reload")
  const actual = JSON.stringify(st.sigma)
  const expected = JSON.stringify(parse(expectedJson))
  if (actual !== expected) throw new Error(`sigma mismatch: ${actual} != ${expected}`)
})

When("the session is deactivated", async function () {
  const registry = new Registry(this.stateDir)
  await registry.deactivate(this.sessionID)
})

When("the system transform hook fires", async function () {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.system = ["base system prompt"]
  await this.hooks["experimental.chat.system.transform"](
    { sessionID: this.sessionID, model: { providerID: "p", modelID: "m" } },
    { system: this.system },
  )
})

Then("the system prompt contains {string}", function (fragment: string) {
  if (!this.system.some((sys: string) => sys.includes(fragment))) throw new Error(`system prompt lacks "${fragment}": ${JSON.stringify(this.system)}`)
})

Then("the system prompt contains the compact sigma:", function (expectedJson: string) {
  const compact = JSON.stringify(parse(expectedJson))
  if (!this.system.some((sys: string) => sys.includes(compact))) throw new Error(`system prompt lacks compact sigma ${compact}`)
})

Then("the system prompt is unchanged", function () {
  if (this.system.length !== 1 || this.system[0] !== "base system prompt")
    throw new Error(`system prompt modified: ${JSON.stringify(this.system)}`)
})

When("the compaction hook fires", async function () {
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  this.compactionContext = []
  await this.hooks["experimental.session.compacting"]({ sessionID: this.sessionID }, { context: this.compactionContext, prompt: undefined })
})

Then("the compaction context contains the compact sigma:", function (expectedJson: string) {
  const compact = JSON.stringify(parse(expectedJson))
  if (!this.compactionContext.some((c: string) => c.includes(compact))) throw new Error("compaction context lacks sigma")
})

// ---- keep-alive ----

type FakeClient = { session: { prompt: (opts: unknown) => Promise<unknown>; messages: (opts: unknown) => Promise<unknown> } }

function fakeClient(world: any): FakeClient {
  const prompts: Array<{ sid: string; opts: unknown }> = []
  world.prompts = prompts
  return {
    session: {
      prompt: async (opts: unknown) => {
        const sid = (opts as { path: { id: string } }).path.id
        prompts.push({ sid, opts })
      },
      messages: async (opts: unknown) => {
        const sid = (opts as { path: { id: string } }).path.id
        const aborted = world.abortLastBySid?.[sid] ?? false
        return [
          {
            info: {
              id: "msg_last",
              sessionID: sid,
              role: "assistant",
              error: aborted ? { name: "MessageAbortedError", message: "Aborted" } : undefined,
            },
            parts: [],
          },
        ]
      },
    },
  }
}

Given("a fake client recording prompts", function () {})

Given("the plugin is created with the fake client", async function () {
  this.client = fakeClient(this)
  this.hooks = await createSkillState({ stateDir: this.stateDir, client: this.client as never })
})

Given("session {string} is activated with patches {int}", async function (sid: string, patches: number) {
  this.sessionID = sid
  if (!this.hooks) this.hooks = await createSkillState({ stateDir: this.stateDir })
  const st = await this.hooks.registry.activate(sid)
  st.patches = patches
  await this.hooks.registry.save(st)
})

Given("session {string} runs agent {string}", async function (sid: string, agent: string) {
  const st = await this.hooks.registry.get(sid)
  if (!st) throw new Error(`no state for ${sid}`)
  st.agent = agent
  await this.hooks.registry.save(st)
})

Then("the nudge names agent {string}", function (agent: string) {
  const all = (this.prompts ?? []) as Array<{ sid: string; opts: { body?: { agent?: string } } }>
  const last = all.at(-1)
  const got = last?.opts?.body?.agent
  if (got !== agent) throw new Error(`expected agent=${agent}, got ${got} (prompts=${JSON.stringify(all)})`)
})

When("session {string} emits idle", { timeout: 30000 }, async function (sid: string) {
  await this.hooks.event({ event: { type: "session.idle", properties: { sessionID: sid } } })
})

When("session {string} emits idle {int} times", { timeout: 60000 }, async function (sid: string, times: number) {
  for (let i = 0; i < times; i++) {
    await this.hooks.event({ event: { type: "session.idle", properties: { sessionID: sid } } })
  }
})

When("the last assistant message of session {string} is aborted", function (sid: string) {
  this.abortLastBySid = { ...(this.abortLastBySid ?? {}), [sid]: true }
})

When("the last assistant message of session {string} is normal", function (sid: string) {
  this.abortLastBySid = { ...(this.abortLastBySid ?? {}), [sid]: false }
})

When("session {string} advances patches to {int}", async function (sid: string, patches: number) {
  const st = this.hooks.registry.get(sid)!
  st.patches = patches
  await this.hooks.registry.save(st)
})

Then("the fake client sent {int} prompt to {string}", function (n: number, sid: string) {
  const sent = (this.prompts ?? []).filter((p: { sid: string }) => p.sid === sid)
  if (sent.length !== n) throw new Error(`expected ${n} prompts to ${sid}, got ${sent.length}`)
})

Then("the fake client sent {int} prompts to {string}", function (n: number, sid: string) {
  const sent = (this.prompts ?? []).filter((p: { sid: string }) => p.sid === sid)
  if (sent.length !== n) throw new Error(`expected ${n} prompts to ${sid}, got ${sent.length}`)
})

Then("state {string} has nudges {int}", async function (sid: string, n: number) {
  const st = await this.hooks.registry.get(sid)
  if ((st?.nudges ?? 0) !== n) throw new Error(`expected nudges=${n}, got ${st?.nudges}`)
})

Then("state {string} is still active", async function (sid: string) {
  const st = await this.hooks.registry.get(sid)
  if (!st?.active) throw new Error("expected session still active")
})

Then("state {string} is inactive", async function (sid: string) {
  const st = await this.hooks.registry.get(sid)
  if (st?.active) throw new Error("expected session inactive")
})

Then("state {string} is stopped", async function (sid: string) {
  const st = await this.hooks.registry.get(sid)
  if (!st?.stopped) throw new Error(`expected stopped=true, got ${st?.stopped}`)
})

Given("session {string} is deactivated", async function (sid: string) {
  await this.hooks.registry.deactivate(sid)
})

Given("env SKILL_STATE_AUTO is {string}", function (v: string) {
  process.env.SKILL_STATE_AUTO = v
})

Given("env SKILL_STATE_AUTO is unset", function () {
  delete process.env.SKILL_STATE_AUTO
})

Given("a fresh session id", function () {
  this.sessionID = `ses_fresh_${Date.now()}`
})

Given("the session id is {string}", function (sid: string) {
  this.sessionID = sid
})
