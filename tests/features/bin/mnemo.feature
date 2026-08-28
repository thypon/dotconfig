Feature: mnemo
  Append a spaced-repetition study entry to the calendar at +1, +7,
  +14 and +28 days.

  Scenario: Writes four dated entries
    Given a HOME with a Documents/calendar file
    When mnemo runs with "Review TCP"
    Then calendar has 4 new lines
    And every line ends with "Review TCP"

  Scenario: Entries land on day offsets 1, 7, 14 and 28
    Given a HOME with a Documents/calendar file
    And today is 2026-08-27
    When mnemo runs with "Review TCP"
    Then calendar contains dates 2026-08-28, 2026-09-03, 2026-09-10 and 2026-09-24