Feature: System prompt and compaction injection

  Scenario: Active session receives protocol and sigma in system prompt
    Given an active session with sigma:
      """json
      {"cwd":"/x"}
      """
    When the system transform hook fires
    Then the system prompt contains "SKILL.state Runtime"
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
