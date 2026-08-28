Feature: countdown
  Count down from N seconds, printing the remaining time as H:M:S.
  Uses portable epoch arithmetic, no GNU date required.

  Scenario: Counts down and exits when reaching zero
    When countdown runs with 1
    Then the script exits 0 within a few seconds
    And the output contains a H:M:S formatted countdown

  Scenario: Non-numeric argument fails
    When countdown runs with "abc"
    Then the script exits non-zero