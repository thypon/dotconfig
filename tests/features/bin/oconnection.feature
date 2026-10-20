Feature: oconnection travel pause CLI
  The oconnection script creates and removes pause flags in the oconnection
  state dir. The opencode gate plugin holds every LLM request while a flag
  exists. Sleepwatcher ~/.sleep pauses with --auto; ~/.wakeup waits for
  connectivity and releases the auto pause.

  Background:
    Given the oconnection state dir is sandboxed

  Scenario: pause then status shows paused
    When oconnection pauses
    Then oconnection status says "paused (manual)"
    And the pause flag exists in the state dir

  Scenario: unpause returns to running
    Given the gate is manually paused
    When oconnection unpauses
    Then oconnection status says "running"
    And no pause flag exists in the state dir

  Scenario: status exit code signals the pause state
    When oconnection reports status
    Then the script exits 0
    Given the gate is manually paused
    When oconnection reports status
    Then the script exits 1

  Scenario: the auto pause flag is separate from the manual flag
    When oconnection pauses with the auto flag
    Then oconnection status says "paused (auto)"
    And the auto pause flag exists in the state dir
    And the pause flag does not exist in the state dir

  Scenario: unpause --all clears both flags
    Given the gate is manually paused
    And the gate is auto paused
    When oconnection unpauses with --all
    Then oconnection status says "running"
    And no pause flag exists in the state dir

  Scenario: unpause --auto keeps a manual pause
    Given the gate is manually paused
    And the gate is auto paused
    When oconnection unpauses with the auto flag
    Then oconnection status says "paused (manual)"

  Scenario: wake releases the auto pause when the connectivity check responds
    Given the gate is auto paused
    When oconnection wakes with a passing check url
    Then the script exits 0
    And oconnection status says "running"

  Scenario: wake keeps the gate when the connectivity check never passes
    Given the gate is auto paused
    When oconnection wakes with a failing check url
    Then the script exits 1
    And oconnection status says "paused (auto)"

  Scenario: wake does nothing when the gate is open
    When oconnection wakes with a failing check url
    Then the script exits 0
    And oconnection status says "running"

  Scenario: wake never releases a manual pause
    Given the gate is manually paused
    When oconnection wakes with a passing check url
    Then the script exits 0
    And oconnection status says "paused (manual)"

  Scenario: an unknown command fails with usage
    When oconnection runs "frobnicate"
    Then the script exits non-zero
    And the usage is printed

  Scenario: pause is recorded in the event log
    When oconnection pauses
    Then the event log records "pause" with flag "manual"

  Scenario: auto pause is recorded in the event log
    When oconnection pauses with the auto flag
    Then the event log records "pause" with flag "auto"

  Scenario: unpause is recorded in the event log
    Given the gate is manually paused
    When oconnection unpauses
    Then the event log records "unpause" with flag "manual"

  Scenario: unpause --all is recorded in the event log
    Given the gate is manually paused
    And the gate is auto paused
    When oconnection unpauses with --all
    Then the event log records "unpause" with flag "all"

  Scenario: wake release is recorded in the event log
    Given the gate is auto paused
    When oconnection wakes with a passing check url
    Then the event log records "wake-release" with flag "auto"

  Scenario: a blocked wake is recorded in the event log
    Given the gate is auto paused
    When oconnection wakes with a failing check url
    Then the script exits 1
    And the event log records "wake-timeout" with flag "auto"

  Scenario: the event log rotates when it grows too large
    Given the event log is seeded past the rotation limit
    When oconnection pauses
    Then the previous event log exists
    And the pause flag exists in the state dir