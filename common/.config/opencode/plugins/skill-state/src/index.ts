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

  return {
    "chat.message": async (input: { sessionID: string; messageID?: string }, output: { parts?: Array<{ type: string; text?: string }> }) => {
      let marker: ReturnType<typeof scanMarker> = null
      for (const part of output.parts ?? []) {
        if (part.type === "text" && typeof part.text === "string") {
          const m = scanMarker(part.text)
          if (m) marker = m
        }
      }
      if (marker === "activate") {
        const st = await registry.activate(input.sessionID, input.messageID)
        await log("info", "skill-state activated", { sessionID: input.sessionID, pMessageID: st.pMessageID })
      } else if (marker === "stop") {
        await registry.deactivate(input.sessionID)
        await log("info", "skill-state deactivated", { sessionID: input.sessionID })
      }
    },

    "command.execute.before": async (input: { command: string; sessionID: string; messageID?: string }) => {
      if (input.command === "skillstate") {
        const st = await registry.activate(input.sessionID, input.messageID)
        await log("info", "skill-state activated via command", { sessionID: input.sessionID, pMessageID: st.pMessageID })
      } else if (input.command === "skillstate-stop") {
        await registry.deactivate(input.sessionID)
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
          "Apply a state patch (ΔΣ) to this session's explicit execution state Σ (SKILL.state runtime). " +
          "Merge semantics: deep merge for nested objects; keys omitted from the patch are preserved; keys set to null are deleted; arrays replace wholesale. " +
          "Call this EVERY step with everything needed for future steps.",
        args: {
          patch: tool.schema.record(tool.schema.string(), tool.schema.unknown()).describe("Key mutations. Set a key to null to delete it."),
          reason: tool.schema.string().optional().describe("Brief reason for this patch (ephemeral, not stored)"),
        },
        execute: async (args, ctx) => {
          const st = await registry.get(ctx.sessionID)
          if (!st?.active) return "SKILL.state is not active in this session."
          const result = merge(st.sigma, args.patch)
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
        description:
          "Signal that the procedural skill has finished. Deactivates the SKILL.state runtime for this session and reports the final execution state Σ.",
        args: {},
        execute: async (_args, ctx) => {
          const st = await registry.deactivate(ctx.sessionID)
          if (!st) return "SKILL.state is not active in this session."
          return [
            "SKILL.state complete. Final Σ:",
            JSON.stringify(st.sigma, null, 2),
            `Metrics: iterations=${st.iterations} patches=${st.patches} errors=${st.errors} tokensOriginal=${st.tokensOriginal} tokensSent=${st.tokensSent}`,
          ].join("\n\n")
        },
      }),

      skill_state_show: tool({
        description: "Show the current execution state Σ and runtime metrics (iterations, tokens original vs sent).",
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
  return createSkillState({ stateDir: process.env.SKILL_STATE_DIR || defaultStateDir(), client })
}) satisfies Plugin
