Feature: replace
  Replace every occurrence of a string in a file using sed with
  escaped delimiters.

  Scenario: Replaces all occurrences
    Given a file with "foo bar foo"
    When replace runs with "foo" and "baz" on that file
    Then the file contains "baz bar baz"

  Scenario: Old string containing slashes is escaped
    Given a file with "a/b c"
    When replace runs with "a/b" and "x" on that file
    Then the file contains "x c"

  Scenario: New string containing ampersand is escaped
    Given a file with "cat"
    When replace runs with "cat" and "&dog" on that file
    Then the file contains "&dog" and not "cat&dog"