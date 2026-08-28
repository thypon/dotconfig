Feature: weather
  Show the weather for a location from wttr.in.

  Scenario: Fetches the location page
    When weather runs with "Oslo"
    Then wttr.in/Oslo is fetched and its body is printed