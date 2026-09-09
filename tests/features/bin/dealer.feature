Feature: dealer
  Pick a random deal from ~/Documents/deals (one shell command per
  line), eval it, and write its output to /tmp/.deals.

  Scenario: Runs a random deal from the deals file
    Given a Documents/deals file with three deals
    And no previous dealer output file
    When dealer runs
    Then the script exits 0
    And the dealer output contains one of the deals

  Scenario: Repeated runs only ever produce listed deals
    Given a Documents/deals file with three deals
    And no previous dealer output file
    When dealer runs 10 times
    Then every dealer output was one of the deals