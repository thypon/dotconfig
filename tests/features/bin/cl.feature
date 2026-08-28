Feature: cl
  Change into a directory and list its contents.

  Scenario: cd into the directory and list it
    Given a directory work containing files
    When cl runs with "work"
    Then a long listing of work is printed

  Scenario: Nonexistent directory fails
    Given no directory nowhere exists
    When cl runs with "nowhere"
    Then the script exits non-zero