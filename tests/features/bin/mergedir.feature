Feature: mergedir
  Merge a remote git repository into a subdirectory of the current
  repository.

  Scenario: Adds a remote named after the subdirectory
    Given a git repo with no remotes
    When mergedir runs with "https://example.com/lib.git", "vendor/lib" and "main"
    Then a remote named "vendor-lib" points at https://example.com/lib.git

  Scenario: Remote tree is read under the subdirectory prefix
    Given a git repo and remote repo with file README.md
    When mergedir runs with the remote, "vendor/lib" and "main"
    Then vendor/lib/README.md is staged in the index

  Scenario: Unrelated histories are merged with ours strategy
    Given a git repo and an unrelated remote repo
    When mergedir runs with the remote, "vendor/lib" and "main"
    Then the merge uses -s ours --no-commit --allow-unrelated-histories
    And a commit is created