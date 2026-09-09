Feature: Loop lookback with exponential backoff
  Repeated bash commands signal the model is looping (collapsed context
  hides prior attempts). On loop detection the collapse retains older
  history with exponential backoff per category: commands keep the last
  2^e tool-bearing messages, chat history the last 2^(e-1) user
  messages, thinking blocks the last 2^(e-4) reasoning parts, where e
  is the loop count. Commands start at e=0, chat at -1, thinking at -4.
  Negative exponents add nothing.

  Background:
    Given an active skill-state session

  Scenario: distinct commands keep collapse minimal
    Given a history of assistant turns with distinct bash commands
    When the messages transform hook fires
    Then the same array instance holds 2 messages
    And the state records loop exponent 0

  Scenario: repeated command retains one previous command message
    Given a history ending with the same bash command twice
    When the messages transform hook fires
    Then the same array instance holds 3 messages
    And the lookback contains 2 command messages
    And no user messages were added back
    And no reasoning parts were added back

  Scenario: exponent grows per loop event
    When the messages transform hook fires 3 times, each time appending one more repeated bash command
    Then the state records loop exponent 3
    And the lookback contains 4 command messages
    And 2 user messages were added back
    And no reasoning parts were added back

  Scenario: thinking blocks appear at exponent 0
    When the messages transform hook fires 5 times, each time appending one more repeated bash command
    Then the state records loop exponent 5
    And 1 reasoning parts were added back

  Scenario: thinking lookback capped by available history
    Given the loop exponent is preset to 5
    When the messages transform hook fires 1 times, each time appending one more repeated bash command
    Then the state records loop exponent 6
    And 1 reasoning parts were added back

  Scenario: clean iterations decay the exponent exponentially
    Given the loop exponent is preset to 8
    And a history of assistant turns with distinct bash commands
    When 3 clean iterations fire with distinct tool calls
    Then the state records loop exponent 7
