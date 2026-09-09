import type { SkillState } from "./state"

export function protocolBlocks(st: SkillState): string[] {
  const sigmaJson = JSON.stringify(st.sigma)
  return [
    [
      "## SKILL.state",
      "History hidden. Visible: task + Σ below + latest obs. Reasoning discarded each step.",
      "Rules:",
      "1. 1 message = 1 step: skill_state_patch + action tool, parallel. Never patch alone.",
      "2. Patch only future-needed facts. omit=preserve · null=delete · array=replace.",
      "3. bash fail → patch to Σ.failures immediately (command + error). Fix or work around.",
      "4. Keep Σ.todo (pending steps) + Σ.done (completed steps) ALWAYS current — update both every step.",
      "5. Σ bounded: no per-step logs beyond Σ.failures/Σ.todo/Σ.done.",
      "6. Task done (per Σ) → patch Σ status=done, then ALWAYS call skill_state_complete as ONLY action.",
      "Σ:",
      "```json",
      sigmaJson,
      "```",
    ].join("\n"),
  ]
}
