Feature: gissue
  Show a GitHub issue with all its comments.

  Scenario: Missing argument prints usage
    When gissue runs with no arguments
    Then the usage line is printed
    And the script exits 1

  Scenario: Invalid issue number aborts
    When gissue runs with "abc"
    Then the script exits 1

  Scenario: Issue number uses origin remote for org/repo
    Given a git repo with origin org/repo on github
    And issue 12 exists with one comment
    When gissue runs with "12"
    Then the issue title, author and body are printed
    And the comment author and body are printed

  Scenario: Issue URL carries its own org/repo
    Given issue https://github.com/other/repo/issues/99 exists
    When gissue runs with the URL
    Then the fetched issue is other/repo#99

  Scenario: Nonexistent issue aborts
    Given a git repo with origin org/repo on github
    When gissue runs with "404"
    Then the script exits 1
    And the output says the issue may not exist