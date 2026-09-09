Feature: Completion lifecycle
  skill_state_complete must terminate SKILL.state decisively: the stop
  latch prevents auto-reactivation on the next plain user message, the
  Σ done-marker auto-completes without a keep-alive nudge, and every
  termination path (tool, Σ marker, give-up) latches stopped.

  Background:
    Given a fake client recording prompts
    And the plugin is created with the fake client

  Scenario: complete tool deactivates and latches stop
    Given session "s1" is activated with patches 3
    When skill_state_complete is called
    Then the tool result contains "SKILL.state complete"
    And state "s1" is inactive
    And state "s1" is stopped

  Scenario: plain message after completion does not auto-reactivate
    Given session "s1" is activated with patches 3
    When skill_state_complete is called
    And a user message "m9" with text "thanks, what was the total?" arrives
    Then state "s1" is inactive

  Scenario: sigma done marker auto-completes without a nudge
    Given session "s1" is activated with patches 1
    And skill_state_patch is called with:
      """
      {"status": "done"}
      """
    When session "s1" emits idle
    Then the fake client sent 0 prompts to "s1"
    And state "s1" is inactive
    And state "s1" is stopped

  Scenario: sigma without done marker still nudges
    Given session "s1" is activated with patches 1
    And skill_state_patch is called with:
      """
      {"status": "running"}
      """
    When session "s1" emits idle
    Then the fake client sent 1 prompt to "s1"
    And state "s1" is still active

  Scenario: keep-alive give-up latches stop
    Given session "s1" is activated with patches 5
    When session "s1" emits idle 4 times
    And a user message "m2" with text "hello" arrives
    Then state "s1" is inactive

  Scenario: marker re-activates a stopped session
    Given session "s1" is activated with patches 5
    When skill_state_complete is called
    And a user message "m3" with text "[skillstate] new task" arrives
    Then state "s1" is still active

  Scenario: SKILL_STATE_SIGMA_DONE=0 disables sigma-done auto-complete
    Given env SKILL_STATE_SIGMA_DONE is "0"
    And session "s1" is activated with patches 3
    When skill_state_patch is called with:
      """
      {"status": "done"}
      """
    And session "s1" emits idle
    Then state "s1" is still active
    And the fake client sent 1 prompt to "s1"
