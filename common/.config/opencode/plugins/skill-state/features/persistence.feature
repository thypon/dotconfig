Feature: State persistence across restarts

  Scenario: Activation writes the state file
    Given an active session with specification message "m1"
    Then the state file exists on disk

  Scenario: A fresh registry lazy-loads an active session
    Given an active session with sigma:
      """json
      {"a":1}
      """
    When a new registry instance is created over the same state directory
    Then the session is active with sigma:
      """json
      {"a":1}
      """

  Scenario: Deactivated session stays inactive after reload
    Given an active session with specification message "m1"
    When the session is deactivated
    And a new registry instance is created over the same state directory
    Then the session is inactive
