import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"
import { collapse } from "./collapse"
import { scanMarker } from "./markers"
import { merge } from "./merge"
import { defaultStateDir, Registry } from "./registry"
import { protocolBlocks } from "./protocol"

export async function createSkillState(opts: { stateDir: string; client?: unknown }) {
  const registry = new Registry(opts.stateDir)
  const client = opts.client as { app?: { log?: (req: unknown) => Promise<unknown> } } | undefined

  const log = async (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
    try {
      await client?.app?.log?.({ body: { service: "skill-state", level, message, extra } })
    } catch {
      // logging must never break the runtime
    }
  }

  const getActive = async (sessionID: string | undefined) => {
    if (!sessionID) return undefined
    const st = await registry.get(sessionID)
    return st?.active ? st : undefined
  }

  const KEEPALIVE_TEXT =
    "Keep-alive: turn ended without skill_state_complete. Task done → call skill_state_complete as ONLY action. Not done → continue: 1 action + patch. Do not redo finished work."

  const DONE_KEYS = ["status", "state", "phase"]
  const DONE_VALUES = new Set(["done", "complete", "completed", "finished"])
  const sigmaDone = (st: { sigma: Record<string, unknown> }) =>
    DONE_KEYS.some((k) => {
      const v = st.sigma?.[k]
      return typeof v === "string" && DONE_VALUES.has(v)
    })

  const completeSession = async (sessionID: string, reason: string) => {
    const st = await registry.deactivate(sessionID)
    if (!st) return undefined
    st.stopped = true
    await registry.save(st)
    await log("info", "skill-state completed", { sessionID, reason, patches: st.patches, iterations: st.iterations })
    return st
  }

  const sessionClient = opts.client as
    | {
        session?: {
          prompt?: (req: { path: { id: string }; body: { agent?: string; parts: Array<{ type: string; text: string }> } }) => Promise<unknown>
          messages?: (req: { path: { id: string } }) => Promise<unknown>
        }
      }
    | undefined

  const lastAssistantAborted = async (sessionID: string): Promise<boolean> => {
    try {
      const res = (await sessionClient?.session?.messages?.({ path: { id: sessionID } })) as unknown
      const list = (Array.isArray(res) ? res : (res as { data?: unknown[] })?.data) ?? []
      let lastErr: { name?: string; aborted?: boolean } | undefined
      let lastRole: string | undefined
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i] as { info?: { role?: string; error?: { name?: string; aborted?: boolean } }; role?: string; error?: { name?: string; aborted?: boolean } } | undefined
        const role = m?.info?.role ?? m?.role
        if (role !== "assistant") continue
        lastErr = m?.info?.error ?? m?.error
        lastRole = role
        break
      }
      await log("info", "skill-state abort-check", { sessionID, count: list.length, lastRole, lastErr: lastErr?.name })
      return !!lastErr && (lastErr.name === "MessageAbortedError" || lastErr.aborted === true)
    } catch (e) {
      await log("warn", "skill-state abort-check failed", { sessionID, error: String(e) })
      return false
    }
  }

  const keepalive = async (sessionID: string) => {
    const st = await registry.get(sessionID)
    if (!st || !st.active) return
    const stalled = (st.stalled ?? 0) + (st.patches === (st.lastPatchesAtNudge ?? -1) ? 1 : 0)
    const nudges = (st.nudges ?? 0) + 1
    st.stalled = stalled
    st.lastPatchesAtNudge = st.patches
    st.nudges = nudges
    if (stalled >= 3 || nudges >= 40) {
      st.active = false
      st.stopped = true
      await registry.save(st)
      await log("warn", "skill-state keep-alive gave up", { sessionID, stalled, nudges })
      return
    }
    await registry.save(st)
    await log("info", "skill-state keep-alive nudge", { sessionID, nudges, patches: st.patches })
    try {
      await sessionClient?.session?.prompt?.({
        path: { id: sessionID },
        body: { agent: st.agent, parts: [{ type: "text", text: KEEPALIVE_TEXT }] },
      })
    } catch (e) {
      await log("warn", "skill-state keep-alive prompt failed", { sessionID, error: String(e) })
    }
  }

  return {
    registry,
    event: async (input: { event: unknown }) => {
      const event = input.event as { type?: string; properties?: { sessionID?: string } }
      if (event.type !== "session.idle") return
      const sid = event.properties?.sessionID
      if (!sid) return
      const st = await registry.get(sid)
      if (!st?.active) return
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (await lastAssistantAborted(sid)) {
        await log("info", "skill-state nudge suppressed (manual abort)", { sessionID: sid })
        return
      }
      if (sigmaDone(st)) {
        await completeSession(sid, "sigma-done-marker")
        return
      }
      await keepalive(sid)
    },
    "chat.message": async (input: { sessionID: string; messageID?: string; agent?: string }, output: { parts?: Array<{ type: string; text?: string }> }) => {
      let marker: ReturnType<typeof scanMarker> = null
      for (const part of output.parts ?? []) {
        if (part.type === "text" && typeof part.text === "string") {
          const m = scanMarker(part.text)
          if (m) marker = m
        }
      }
      if (marker === "activate") {
        const st = await registry.activate(input.sessionID, input.messageID)
        st.stopped = false
        if (input.agent) st.agent = input.agent
        await registry.save(st)
        await log("info", "skill-state activated", { sessionID: input.sessionID, pMessageID: st.pMessageID })
      } else if (marker === "stop") {
        const st = await registry.deactivate(input.sessionID)
        if (st) {
          st.stopped = true
          await registry.save(st)
        }
        await log("info", "skill-state deactivated", { sessionID: input.sessionID })
      } else if (process.env.SKILL_STATE_AUTO !== "0") {
        const existing = await registry.get(input.sessionID)
        if (!existing?.active && !existing?.stopped) {
          const st = await registry.activate(input.sessionID, input.messageID)
          if (input.agent) st.agent = input.agent
          await registry.save(st)
          await log("info", "skill-state auto-activated", { sessionID: input.sessionID, pMessageID: st.pMessageID })
        }
      }
    },

    "command.execute.before": async (input: { command: string; sessionID: string; messageID?: string }) => {
      if (input.command === "skillstate") {
        const st = await registry.activate(input.sessionID, input.messageID)
        st.stopped = false
        await registry.save(st)
        await log("info", "skill-state activated via command", { sessionID: input.sessionID, pMessageID: st.pMessageID })
      } else if (input.command === "skillstate-stop") {
        const st = await registry.deactivate(input.sessionID)
        if (st) {
          st.stopped = true
          await registry.save(st)
        }
        await log("info", "skill-state deactivated via command", { sessionID: input.sessionID })
      }
    },

    "experimental.chat.messages.transform": async (_input: Record<string, never>, output: { messages: unknown[] }) => {
      const first = output.messages[0] as { info?: { sessionID?: string } } | undefined
      const st = await getActive(first?.info?.sessionID)
      if (!st) return
      const result = collapse(output.messages as never[], st)
      await registry.save(st)
      await log("debug", "skill-state collapse", {
        sessionID: st.sessionID,
        iterations: st.iterations,
        kept: result.kept,
        original: result.original,
        tokensOriginal: result.tokensOriginal,
        tokensSent: result.tokensSent,
      })
    },

    "experimental.chat.system.transform": async (input: { sessionID?: string }, output: { system: string[] }) => {
      const st = await getActive(input.sessionID)
      if (!st) return
      output.system.push(...protocolBlocks(st))
    },

    "experimental.session.compacting": async (input: { sessionID: string }, output: { context: string[] }) => {
      const st = await getActive(input.sessionID)
      if (!st) return
      output.context.push(["## Skill Execution State (Σ)", "```json", JSON.stringify(st.sigma), "```"].join("\n"))
    },

    tool: {
      skill_state_patch: tool({
        description:
          "Apply state patch ΔΣ to session execution state Σ (SKILL.state). " +
          "Deep merge; omitted keys preserved; null deletes; arrays replace. " +
          "Call EVERY step with all state needed for future steps.",
        args: {
          patch: tool.schema.record(tool.schema.string(), tool.schema.unknown()).describe("Key mutations. Set a key to null to delete it."),
          reason: tool.schema.string().optional().describe("Brief reason for this patch (ephemeral, not stored)"),
        },
        execute: async (args, ctx) => {
          const st = await registry.get(ctx.sessionID)
          if (!st?.active) return "SKILL.state is not active in this session."
          let patch: unknown = args.patch
          if (typeof patch === "string") {
            try {
              patch = JSON.parse(patch)
            } catch {
              st.errors++
              await registry.save(st)
              return 'PATCH REJECTED — patch must be a JSON object (dict), e.g. {"key": "value"}. State unchanged. Fix the patch and retry.'
            }
          }
          const result = merge(st.sigma, patch)
          if (!result.ok) {
            st.errors++
            await registry.save(st)
            return `PATCH REJECTED — ${result.error}. State unchanged. Fix the patch and retry.`
          }
          st.sigma = result.sigma
          st.patches++
          await registry.save(st)
          const keys = Object.keys(st.sigma)
          return `State patch applied (patch #${st.patches}). Σ keys: ${keys.length ? keys.join(", ") : "(empty)"}`
        },
      }),

      skill_state_complete: tool({
        description: "Skill finished. Deactivates SKILL.state, reports final Σ + metrics.",
        args: {},
        execute: async (_args, ctx) => {
          const st = await completeSession(ctx.sessionID, "tool")
          if (!st) return "SKILL.state is not active in this session."
          return [
            "SKILL.state complete. Final Σ:",
            JSON.stringify(st.sigma, null, 2),
            `Metrics: iterations=${st.iterations} patches=${st.patches} errors=${st.errors} tokensOriginal=${st.tokensOriginal} tokensSent=${st.tokensSent}`,
          ].join("\n\n")
        },
      }),

      skill_state_show: tool({
        description: "Show execution state Σ + runtime metrics.",
        args: {},
        execute: async (_args, ctx) => {
          const st = await registry.get(ctx.sessionID)
          if (!st) return "No SKILL.state for this session."
          return [
            "Σ:",
            JSON.stringify(st.sigma, null, 2),
            `Metrics: iterations=${st.iterations} patches=${st.patches} errors=${st.errors} tokensOriginal=${st.tokensOriginal} tokensSent=${st.tokensSent} active=${st.active}`,
          ].join("\n\n")
        },
      }),
    },
  }
}

export default (async ({ client }) => {
  console.error(
    "[skill-state] registered, tools: skill_state_patch, skill_state_complete, skill_state_show " +
      "(activate per session with [skillstate] marker or /skillstate command)",
  )
  return createSkillState({ stateDir: process.env.SKILL_STATE_DIR || defaultStateDir(), client })
}) satisfies Plugin
