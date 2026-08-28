Feature: greviews
  Show PR reviews and review comments with diff hunks for the current
  branch, optionally excluding users.

  Scenario: Not a git repository aborts
    Given the current directory is not a git repository
    When greviews runs
    Then the script exits 1

  Scenario: No PR for current branch aborts
    Given a git repo with origin org/repo on github
    And gh pr list returns no PR for the current branch
    When greviews runs
    Then the script exits 1

  Scenario: Lists reviews and their comments
    Given a git repo with origin org/repo on github
    And PR 3 open for the current branch
    And a review by alice with one comment
    When greviews runs
    Then the review by alice is shown
    And the comment diff hunk is shown

  Scenario: Named users are excluded
    Given a git repo with origin org/repo on github
    And PR 3 open for the current branch
    And reviews by alice and bob
    When greviews runs with "bob"
    Then bob's review is not shown
    And alice's review is shown