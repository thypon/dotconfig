Feature: cb
  Copy a string or stdin to the clipboard via xclip.

  Scenario: Copies an argument string to the clipboard
    Given xclip is available
    When cb runs with "hello world"
    Then xclip receives "hello world" on selection c
    And the output confirms the copy

  Scenario: Copies piped stdin when input is redirected
    Given xclip is available
    And stdin is a pipe containing "from stdin"
    When cb runs with no arguments
    Then xclip receives "from stdin" on selection c
    And the output confirms the copy

  Scenario: Fails when xclip is not installed
    Given xclip is not on PATH
    When cb runs with "hello"
    Then the script exits 1
    And the output tells the user to install xclip

  Scenario: Refuses to run as root
    Given xclip is available
    And the effective user is root
    When cb runs with "hello"
    Then the script exits 1
    And the output explains a regular user is required

  Scenario: Empty input prints usage
    Given xclip is available
    When cb runs with no arguments and no stdin
    Then the output shows the usage lines
    And the script exits 0

  Scenario: Long input is copied in full but echoed truncated
    Given xclip is available
    When cb runs with a 100-character string
    Then xclip receives the full 100-character string
    And the echo shows only the first 80 characters followed by "..."