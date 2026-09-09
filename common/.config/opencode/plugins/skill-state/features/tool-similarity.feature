Feature: Tool call similarity detection with linear decay
  Loop detection must cover ALL tools (not just bash): a call loops when
  the same tool runs with near-identical arguments. Similarity = tool
  name equality + argument token Jaccard; score >= 0.6 loops.
  When iterations run clean (no loop), the loop exponent decays:
  every 3 consecutive clean iterations halve the loop count.

  Background:
    Given an active skill-state session

  Scenario: same tool with different arguments is not a loop
    Given a history ending with tool calls "read" {"path": "a.ts"} then "read" {"path": "b.ts"}
    When the messages transform hook fires
    Then the state records loop exponent 0
    And the same array instance holds 2 messages

  Scenario: non-bash tool repeating with same arguments loops
    Given a history ending with tool calls "read" {"path": "a.ts"} then "read" {"path": "a.ts"}
    When the messages transform hook fires
    Then the state records loop exponent 1
    And the lookback contains 2 command messages

  Scenario: increment-style commands differing only in digits are progress, not loop
    Given a history ending with tool calls "bash" {"command": "echo 'i=1 total=1' >> count_log.txt"} then "bash" {"command": "echo 'i=2 total=3' >> count_log.txt"}
    When the messages transform hook fires
    Then the state records loop exponent 0
    And the same array instance holds 2 messages

  Scenario: near-identical arguments (whitespace/format) loop
    Given a history ending with tool calls "bash" {"command": "ls -la src"} then "bash" {"command": "ls  -la  src"}
    When the messages transform hook fires
    Then the state records loop exponent 1

  Scenario: three similar calls within the window loop
    Given a history ending with 3 tool calls "bash" {"command": "npm test"} then "bash" {"command": "npm run test"} then "bash" {"command": "npm  test"}
    When the messages transform hook fires
    Then the state records loop exponent 1

  Scenario: exponent decays after consecutive clean iterations
    Given the loop exponent is preset to 8
    When 3 clean iterations fire with distinct tool calls
    Then the state records loop exponent 7

  Scenario: repeated decay reaches zero
    Given the loop exponent is preset to 1
    When 3 clean iterations fire with distinct tool calls
    Then the state records loop exponent 0

  Scenario: decayed exponent drives lookback expansion
    Given the loop exponent is preset to 8
    When 3 clean iterations fire with distinct tool calls
    And a history ending with tool calls "bash" {"command": "npm test"} then "bash" {"command": "npm test"}
    When the messages transform hook fires
    Then the state records loop exponent 8
    And the lookback contains 2 command messages

  Scenario: equal-digit-count increment commands are progress, not loop
    Given a history ending with tool calls "bash" {"command": "echo 'i=53 total=1431' >> count_log.txt"} then "bash" {"command": "echo 'i=52 total=1378' >> count_log.txt"}
    When the messages transform hook fires
    Then the state records loop exponent 0
    And the same array instance holds 2 messages

  Scenario: same command with fresh output is progress, not loop
    Given a history ending with the same command with outputs "8" then "9"
    When the messages transform hook fires
    Then the state records loop exponent 0
    And the same array instance holds 2 messages

  Scenario: same command with stale identical output is a loop
    Given a history ending with the same command with outputs "8" then "8"
    When the messages transform hook fires
    Then the state records loop exponent 1
    And the lookback contains 2 command messages
