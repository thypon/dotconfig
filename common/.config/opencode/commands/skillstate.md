---
description: Activate SKILL.state runtime for this session (bounded O(1) prompt, explicit execution state)
---
[skillstate] Run the following as a long-horizon procedural skill under the SKILL.state runtime. At every step, project everything needed for future steps into the execution state via the `skill_state_patch` tool (keys set to null are deleted; omitted keys are preserved). Your reasoning is discarded after each step — never rely on it persisting.

$ARGUMENTS
