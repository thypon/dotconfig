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

  Scenario: Text without markers does not activate
    When a user message "m1" with text "plain task without markers" arrives
    Then no session state exists
