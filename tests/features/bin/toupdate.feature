Feature: toupdate
  List Void Linux packages needing updates, filtering out ones the
  local void-packages checkout already updated recently.

  Scenario: No local checkout prints the upstream list as-is
    Given no void-packages git checkout at $VOID_PACKAGES
    And the updates feed lists pkg-a and pkg-b
    When toupdate runs
    Then the output lists pkg-a and pkg-b

  Scenario: Recently updated packages are filtered out
    Given a void-packages checkout whose last 100 commits update pkg-a
    And the updates feed lists pkg-a and pkg-b
    When toupdate runs
    Then the output lists pkg-b only

  Scenario: No update commits prints the full list
    Given a void-packages checkout with no "update to" commits
    And the updates feed lists pkg-a
    When toupdate runs
    Then the output lists pkg-a