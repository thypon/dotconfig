Feature: subl-head
  Open files changed in HEAD vs the base commit in Sublime Text.

  Scenario: Opens changed files plus the current directory
    Given a git repo with BASE_COMMIT origin/master
    And HEAD changes a.py and b.py
    When subl-head runs
    Then subl is invoked with "." and a.py and b.py

  Scenario: BASE_COMMIT environment overrides the default
    Given a git repo
    And BASE_COMMIT is origin/develop
    When subl-head runs
    Then the diff base is origin/develop