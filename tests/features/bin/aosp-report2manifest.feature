Feature: aosp-report2manifest
  Convert an aosp-reapply CSV report into a repo manifest XML.

  Scenario: Rows with zero diffs become remove-project and project entries
    Given a report line "vendor/x,branch_a,branch_b,branch_b,0"
    When aosp-report2manifest runs with the report and prefix "vendor/"
    Then the manifest contains remove-project name="platform_x"
    And the manifest contains project name="platform/x" path="x"

  Scenario: Project gets a revision when target branch differs
    Given a report line "vendor/x,branch_a,branch_b,target_c,0"
    When aosp-report2manifest runs with the report and prefix "vendor/"
    Then the project element carries revision="target_c"

  Scenario: Rows with non-zero diffs are skipped
    Given a report line "vendor/x,branch_a,branch_b,target_b,42"
    When aosp-report2manifest runs with the report and prefix "vendor/"
    Then the manifest contains no project for vendor/x

  Scenario: Output is a complete manifest document
    Given a report with at least one matching row
    When aosp-report2manifest runs
    Then the output starts with the XML declaration
    And the output ends with the closing manifest tag