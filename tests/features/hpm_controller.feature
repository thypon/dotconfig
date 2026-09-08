Feature: High Power Mode controller
  The hpm-controller daemon keeps the MacBook power mode aligned
  with power source (AC/Battery) and the configured work WiFi SSID.
  It also enforces a sleep policy based on power source alone:
  AC power never suspends (even with the lid closed), battery restores normal sleep.

  Background:
    Given the power mode value mapping is pinned

  Scenario: AC power and work SSID selects High Power Mode
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    Then pmset is called with powermode 2
    And no notification is shown

  Scenario: AC power and a different SSID selects Automatic
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "HOME_NET"
    And the current powermode is 2
    And the current disablesleep is 1
    When the controller runs
    Then pmset is called with powermode 0
    And no notification is shown

  Scenario: AC power with WiFi off selects Automatic
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi is off
    And the current powermode is 2
    And the current disablesleep is 1
    When the controller runs
    Then pmset is called with powermode 0
    And no notification is shown

  Scenario: Battery power and work SSID selects Automatic
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is Battery
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 2
    And the current disablesleep is 0
    When the controller runs
    Then pmset is called with powermode 0
    And no notification is shown

  Scenario: Battery power and a different SSID selects Low Power Mode
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is Battery
    And the WiFi SSID is "HOME_NET"
    And the current powermode is 0
    And the current disablesleep is 0
    When the controller runs
    Then pmset is called with powermode 1
    And no notification is shown

  Scenario: Battery power with WiFi off selects Low Power Mode
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is Battery
    And the WiFi is off
    And the current powermode is 0
    And the current disablesleep is 0
    When the controller runs
    Then pmset is called with powermode 1
    And no notification is shown

  Scenario: Desired mode already active does not call pmset
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 2
    And the current disablesleep is 1
    When the controller runs
    Then pmset is not called at all

  Scenario: Missing secrets skips power mode and notifies
    Given no secrets file exists
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    Then pmset is not called at all
    And a notification is shown
    And the notification timestamp is recorded

  Scenario: Missing secrets notification is rate limited to once per hour
    Given no secrets file exists
    And a notification was shown 10 minutes ago
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    Then pmset is not called at all
    And no notification is shown

  Scenario: Empty secrets key skips controller and notifies
    Given a fake secrets file with hpm_wifi_ssid ""
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    Then pmset is not called at all
    And a notification is shown

  Scenario: Unsupported pmset powermode does not crash and does not set
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And pmset reports an unsupported powermode
    And the current disablesleep is 1
    When the controller runs
    Then the controller exits 0
    And pmset is not called at all

  Scenario: Controller is idempotent across repeated runs
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    And the controller runs again
    Then pmset set powermode was called exactly once

  Scenario: AC power disables system sleep
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 2
    And the current disablesleep is 0
    When the controller runs
    Then pmset is called with disablesleep 1
    And no notification is shown

  Scenario: Battery power restores normal sleep
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is Battery
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 0
    And the current disablesleep is 1
    When the controller runs
    Then pmset is called with disablesleep 0
    And no notification is shown

  Scenario: Sleep policy is idempotent across repeated runs
    Given a fake secrets file with hpm_wifi_ssid "TEST_WORK_SSID"
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current powermode is 2
    And the current disablesleep is 0
    When the controller runs
    And the controller runs again
    Then pmset is called with disablesleep 1

  Scenario: Missing secrets still enforces stay-awake on AC
    Given no secrets file exists
    And the power source is AC
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current disablesleep is 0
    When the controller runs
    Then pmset is called with disablesleep 1
    And a notification is shown
    And the notification timestamp is recorded

  Scenario: Missing secrets still restores sleep on battery
    Given no secrets file exists
    And the power source is Battery
    And the WiFi SSID is "TEST_WORK_SSID"
    And the current disablesleep is 1
    When the controller runs
    Then pmset is called with disablesleep 0
    And a notification is shown
