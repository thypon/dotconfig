Feature: ds4
  Control the DwarfStar ds4-server launchd service (up/down/restart/status/logs).

  Background:
    Given the ds4 service is controlled via DS4_DOMAIN gui/999

  Scenario: up bootstraps the agent when unloaded
    Given launchctl reports the agent as unloaded
    When ds4 runs with "up"
    Then launchctl bootstraps gui/999/com.dwarfstar.ds4-server from the plist
    And the script exits 0

  Scenario: up is idempotent when already running
    Given launchctl reports the agent as running
    When ds4 runs with "up"
    Then launchctl is not called with bootstrap
    And the script exits 0

  Scenario: up kickstarts a loaded but stopped agent
    Given launchctl reports the agent as stopped
    When ds4 runs with "up"
    Then launchctl kickstarts gui/999/com.dwarfstar.ds4-server
    And the script exits 0

  Scenario: down boots out the agent
    Given launchctl reports the agent as running
    When ds4 runs with "down"
    Then launchctl boots out gui/999/com.dwarfstar.ds4-server
    And the script exits 0

  Scenario: down is idempotent when not loaded
    Given launchctl reports the agent as unloaded
    When ds4 runs with "down"
    Then the script exits 0

  Scenario: restart kickstarts a loaded agent
    Given launchctl reports the agent as running
    When ds4 runs with "restart"
    Then launchctl kickstarts gui/999/com.dwarfstar.ds4-server
    And the script exits 0

  Scenario: status reports a running healthy server
    Given launchctl reports the agent as running
    And the API answers with a model list
    When ds4 runs with "status"
    Then the script exits 0
    And the output reports running state and a served model

  Scenario: status exits 1 when the agent is not loaded
    Given launchctl reports the agent as unloaded
    When ds4 runs with "status"
    Then the script exits 1

  Scenario: logs tails the log file
    Given the ds4 log file exists
    When ds4 runs with "logs"
    Then tail follows the ds4 log file

  Scenario: no command prints usage and exits 1
    When ds4 runs with no arguments
    Then the script exits 1
