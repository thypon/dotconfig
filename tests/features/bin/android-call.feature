Feature: android-call
  Place phone calls on a connected Android device via adb for each
  argument given.

  Scenario: Dial each argument through the adb phone service
    When android-call runs with "15551234567"
    Then adb shell service call phone is invoked with the URL-encoded number
    And the output mentions calling the number

  Scenario: Sleep between calls when CALL_SLEEP is set
    Given CALL_SLEEP is 5
    When android-call runs with "111" and "222"
    Then sleep 5 happens between the two adb calls