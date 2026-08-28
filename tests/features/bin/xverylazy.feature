Feature: xverylazy
  Update and build every Void Linux package that needs updating.

  Scenario: Feeds all outdated packages to xlazy
    Given a void-packages repo
    And the updates feed lists pkg-a and pkg-b
    When xverylazy runs
    Then xlazy is called with pkg-a and pkg-b

  Scenario: No updates exits 0 quietly
    Given a void-packages repo
    And the updates feed is empty
    When xverylazy runs
    Then the script exits 0 saying there is nothing to update

  Scenario: Outside a void-packages repo dies
    Given the current directory is not a void-packages checkout
    When xverylazy runs
    Then the script exits 1 saying xbps-src is missing