import type { SkillState } from "./state"

export function protocolBlocks(st: SkillState): string[] {
  const sigmaJson = JSON.stringify(st.sigma)
  return [
    [
      "## SKILL.state Runtime (active)",
      "",
      "This session runs under the SKILL.state runtime: the conversation history is replaced by an explicit, mutable execution state Σ. Previous observations and your earlier reasoning are NOT in context.",
      "",
      "Protocol:",
      "1. At every step, call `skill_state_patch` IN THE SAME MESSAGE as your action tool call (parallel tool calls): one message = one patch + one action. NEVER spend a separate message on the patch alone — every extra message re-pays the full prompt cost.",
      "2. Patch with everything needed for FUTURE steps: findings, decisions, file paths, failed hypotheses, plan progress. Keys omitted from a patch are preserved; set a key to null to delete it; arrays replace wholesale.",
      "3. Your reasoning is ephemeral — it is discarded after each step. Only (a) the task specification (first message), (b) the current Σ below, and (c) the latest observation are visible to you.",
      "4. Project information into Σ the moment it becomes known; it may never appear again.",
      "5. Keep Σ SMALL and bounded: store only aggregates, counters, positions, and decisions needed for FUTURE steps. NEVER append a per-step log, history array, or anything that grows with the number of steps.",
      "",
      "Skill Execution State (Σ):",
      "```json",
      sigmaJson,
      "```",
    ].join("\n"),
  ]
}
