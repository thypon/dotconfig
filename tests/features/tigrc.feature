Feature: tig diff viewer uses difftastic
  The tigrc in common/ binds D to launch difftastic for the commit or
  file under the cursor, while tig's built-in diff views stay unified.

  Scenario: D in the main view shows the selected commit with difftastic
    Given a scratch repo with a commit that changes a file
    And a shimmed difft on PATH
    When the D binding of the main view runs on HEAD
    Then difft is invoked by git with the changed file

  Scenario: D in the status view shows the working tree diff with difftastic
    Given a scratch repo with a commit that changes a file
    And a shimmed difft on PATH
    When the D binding of the status view runs on the file
    Then difft is invoked by git with the changed file

  Scenario: tig's built-in diff views stay unified
    Then the tigrc contains no diff-options setting

  Scenario: tig loads the tigrc without errors
    Given tig is installed
    When tig starts with the tigrc loaded
    Then no tigrc errors are reported
