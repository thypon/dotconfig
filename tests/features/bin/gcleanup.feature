Feature: gcleanup
  Delete github-actions[bot] issue and review comments from the PR of
  the current branch.

  Scenario: Not a git repository aborts
    Given the current directory is not a git repository
    When gcleanup runs
    Then the script exits 1
    And the output says no origin remote found

  Scenario: Unparseable origin aborts
    Given a git repo with origin https://gitlab.com/foo/bar.git
    When gcleanup runs
    Then the script exits 1

  Scenario: No PR for current branch aborts
    Given a git repo with origin on github.com
    And gh pr list returns no PR for the current branch
    When gcleanup runs
    Then the script exits 1

  Scenario: Deletes bot issue comments and review comments
    Given a git repo with origin org/repo on github
    And PR 7 open for the current branch
    And github-actions[bot] left 2 issue comments and 1 review comment
    When gcleanup runs
    Then all 3 bot comments are deleted via gh api DELETE
    And non-bot comments are untouched

  Scenario: No bot comments means nothing is deleted
    Given a git repo with origin org/repo on github
    And PR 7 open for the current branch
    And only human comments exist
    When gcleanup runs
    Then no DELETE api calls are made