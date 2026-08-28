Feature: gfailed
  Show the logs of failed CI checks for the PR of the current branch.

  Scenario: Not a git repository aborts
    Given the current directory is not a git repository
    When gfailed runs
    Then the script exits 1

  Scenario: No PR for current branch aborts
    Given a git repo with origin org/repo on github
    And gh pr list returns no PR for the current branch
    When gfailed runs
    Then the script exits 1

  Scenario: No failed checks exits 0
    Given a git repo with origin org/repo on github
    And PR 5 open for the current branch
    And all checks are passing
    When gfailed runs
    Then the output says no failed checks
    And the script exits 0

  Scenario: Prints logs for each failed check
    Given a git repo with origin org/repo on github
    And PR 5 open for the current branch
    And checks "build" and "lint" failing
    When gfailed runs
    Then the job log for build is printed
    And the job log for lint is printed

  Scenario: Check URL without a job id is skipped
    Given a git repo with origin org/repo on github
    And PR 5 open for the current branch
    And a failed check whose URL ends with an empty job id
    When gfailed runs
    Then the output says the job ID could not be extracted
    And no gh run view is called for that check