import { After, Before, defineParameterType, setWorldConstructor } from "@cucumber/cucumber"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

defineParameterType({
  name: "json",
  regexp: /\{.*\}/,
  transformer: (s: string) => JSON.parse(s) as unknown,
  useForSnippets: false,
})

export type PartLike = { type: string; [k: string]: unknown }
export type WithParts = { info: { id: string; sessionID: string; role: string; [k: string]: unknown }; parts: PartLike[] }

export function userMsg(sessionID: string, id: string, text: string): WithParts {
  return { info: { id, sessionID, role: "user", time: { created: 1 } }, parts: [{ type: "text", text }] }
}

export function assistantMsg(sessionID: string, id: string, opts: { text?: string; reasoning?: string; toolParts?: PartLike[] } = {}): WithParts {
  const parts: PartLike[] = [{ type: "step-start" }]
  if (opts.reasoning) parts.push({ type: "reasoning", text: opts.reasoning })
  if (opts.text) parts.push({ type: "text", text: opts.text })
  for (const tp of opts.toolParts ?? []) parts.push(tp)
  parts.push({ type: "step-finish" })
  return { info: { id, sessionID, role: "assistant", time: { created: 1 } }, parts }
}

export function toolPart(callID: string, tool: string, output: string, input?: Record<string, unknown>): PartLike {
  return { type: "tool", callID, tool, state: { status: "completed", output, ...(input ? { input } : {}) } }
}

export function padding(n: number): string {
  return "x".repeat(n)
}

export class SkillStateWorld {
  stateDir: string = ""
  hooks: any = null
  sessionID = "ses_test"
  messages: WithParts[] = []
  system: string[] = []
  compactionContext: string[] = []
  toolResult: string | null = null
  mergeResult: { ok: boolean; error?: string } | null = null
  sigma: Record<string, unknown> | null = null
}

setWorldConstructor(SkillStateWorld)

Before(async function () {
  this.stateDir = await mkdtemp(join(tmpdir(), "skill-state-"))
})

After(async function () {
  await rm(this.stateDir, { recursive: true, force: true })
})
