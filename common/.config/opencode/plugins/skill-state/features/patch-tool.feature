Feature: skill_state_patch tool with rollback-retry
  As the SKILL.state runtime
  I need schema-validated state patches
  So that malformed updates never corrupt the execution state

  Scenario: Valid patch merges and persists to disk
    Given an active session with specification message "m1"
    When skill_state_patch is called with:
      """json
      {"cwd":"/x"}
      """
    Then the tool result contains "State patch applied"
    And the state file on disk has sigma:
      """json
      {"cwd":"/x"}
      """

  Scenario: Rejected patch returns error observation and leaves state unchanged
    Given an active session with sigma:
      """json
      {"x":1}
      """
    When skill_state_patch is called with a 70000 byte string value
    Then the tool result contains "PATCH REJECTED"
    And the state file on disk has sigma:
      """json
      {"x":1}
      """
    And the state records errors 1

  Scenario: Patch on an inactive session is refused
    When skill_state_patch is called with:
      """json
      {"x":1}
      """
    Then the tool result contains "not active"

  Scenario: skill_state_complete deactivates and reports final state
    Given an active session with sigma:
      """json
      {"done_items":3}
      """
    When skill_state_complete is called
    Then the session is inactive
    And the tool result contains "done_items"

  Scenario: skill_state_show reports sigma and metrics
    Given an active session with sigma:
      """json
      {"x":1}
      """
    When skill_state_show is called
    Then the tool result contains "iterations"
    And the tool result contains "tokensOriginal"
