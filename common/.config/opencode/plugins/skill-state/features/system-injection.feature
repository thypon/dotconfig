Feature: System prompt and compaction injection

  Scenario: Active session receives protocol and sigma in system prompt
    Given an active session with sigma:
      """json
      {"cwd":"/x"}
      """
    When the system transform hook fires
    Then the system prompt contains "SKILL.state"
    And the system prompt contains "1 message = 1 step"
    And the system prompt contains "null=delete"
    And the system prompt contains "Σ bounded"
    And the system prompt contains "bash fail → patch to Σ.failures"
    And the system prompt contains "Σ.todo"
    And the system prompt contains "Σ.done"
    And the system prompt contains "ALWAYS call skill_state_complete"
    And the system prompt contains the compact sigma:
      """json
      {"cwd":"/x"}
      """

  Scenario: Inactive session system prompt untouched
    When the system transform hook fires
    Then the system prompt is unchanged

  Scenario: Compaction context includes sigma
    Given an active session with sigma:
      """json
      {"cwd":"/x"}
      """
    When the compaction hook fires
    Then the compaction context contains the compact sigma:
      """json
      {"cwd":"/x"}
      """
