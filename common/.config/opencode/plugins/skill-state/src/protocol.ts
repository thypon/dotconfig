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
      "3. Learn → patch instantly. Info may never reappear.",
      "4. Σ bounded: no per-step logs/arrays.",
      "5. Task done → patch Σ status=done, then skill_state_complete as ONLY action.",
      "Σ:",
      "```json",
      sigmaJson,
      "```",
    ].join("\n"),
  ]
}
