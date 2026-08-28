Feature: stopwatch
  Continuously print elapsed time as H:M:S until interrupted.

  Scenario: Prints elapsed time and runs until killed
    When stopwatch runs
    Then the output shows an incrementing H:M:S elapsed counter
    And the process keeps running until terminated