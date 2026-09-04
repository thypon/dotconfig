Feature: Auto activation via markers and commands

  Scenario: skillstate marker in a user message activates the session
    When a user message "m1" with text "[skillstate] refactor the parser module" arrives
    Then the session is active
    And the specification message id is "m1"

  Scenario: skillstate stop marker deactivates the session
    Given an active session with specification message "m1"
    When a user message "m2" with text "[skillstate stop]" arrives
    Then the session is inactive

  Scenario: Marker in an already active session is a no-op
    Given an active session with specification message "m1"
    When a user message "m2" with text "[skillstate] again" arrives
    Then the session is active
    And the specification message id is still "m1"

  Scenario: skillstate command activates the session
    When the "skillstate" command executes with message id "m1"
    Then the session is active
    And the specification message id is "m1"

  Scenario: skillstate-stop command deactivates the session
    Given an active session with specification message "m1"
    When the "skillstate-stop" command executes
    Then the session is inactive

  Scenario: SKILL_STATE_AUTO=0 keeps marker-only activation
    Given env SKILL_STATE_AUTO is "0"
    And a fresh session id
    When a user message "m1" with text "plain task without markers" arrives
    Then no session state exists

  Scenario: default (env unset) auto-activates every session without a marker
    Given env SKILL_STATE_AUTO is unset
    And a fresh session id
    When a user message "m1" with text "normal task without marker" arrives
    Then the session is active

  Scenario: explicit stop latches against auto re-activation
    Given env SKILL_STATE_AUTO is unset
    And a fresh session id
    And session "ses_latch" is activated with patches 1
    And the session id is "ses_latch"
    When a user message "m2" with text "[skillstate stop]" arrives
    And a user message "m3" with text "next normal task" arrives
    Then the session is inactive
