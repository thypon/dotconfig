Feature: cheat
  Fetch a cheat sheet from cheat.sh.

  Scenario: Fetches the topic page
    When cheat runs with "tar"
    Then cheat.sh/tar is fetched and its body is printed