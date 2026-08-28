Feature: spr
  Run semgrep on files changed in a branch versus the base commit,
  inside a temporary worktree.

  Scenario: Scans only files changed in the branch
    Given a git repo with BASE_COMMIT origin/master
    And branch feature changes a.py and b.py
    When spr runs with "feature"
    Then semgrep is invoked on exactly a.py and b.py

  Scenario: BASE_COMMIT environment overrides the default
    Given a git repo
    And BASE_COMMIT is origin/develop
    When spr runs with "feature"
    Then the merge-base uses origin/develop

  Scenario: Temp worktree is cleaned up after the run
    Given a git repo
    When spr runs with "feature"
    Then no extra git worktree remains after exit

  Scenario: Extra flags before the branch go to semgrep
    When spr runs with --config and auto and "feature"
    Then semgrep receives --config auto before the file list