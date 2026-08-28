Feature: repo-dir
  Print the nearest ancestor directory containing .repo.

  Scenario: Prints the ancestor that holds .repo
    Given /repo/.repo exists and cwd is /repo/sub/deep
    When repo-dir runs
    Then the output is /repo

  Scenario: Falls back to the current directory
    Given no ancestor contains .repo
    And cwd is /tmp/somewhere
    When repo-dir runs
    Then the output is /tmp/somewhere