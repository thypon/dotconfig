Feature: O(1) history collapse
  As the SKILL.state runtime
  I need the message history collapsed to (specification, latest observation)
  So that the prompt footprint stays bounded as the horizon grows

  Scenario: Long horizon collapses to specification plus latest observation
    Given an active skill-state session
    And a 200-message history of assistant turns with 300 character padding
    When the messages transform hook fires
    Then the same array instance holds 2 messages
    And the first message is the specification message
    And the last message is the latest assistant message with only tool and step parts
    And no text or reasoning parts remain on the assistant message

  Scenario: New user turn after the agent loop ends keeps only the latest user observation
    Given an active skill-state session
    And a history of spec message, text-only assistant message, and new user observation
    When the messages transform hook fires
    Then the same array instance holds 2 messages
    And the messages are the specification message and the new user observation

  Scenario: Token metrics accumulate per iteration
    Given an active skill-state session
    And a 40-message history of assistant turns with 300 character padding
    When the messages transform hook fires
    Then the state records iterations 1
    And the state records tokensOriginal greater than tokensSent

  Scenario: Cumulative prompt cost stays linear not quadratic
    Given an active skill-state session
    When the messages transform hook fires 50 times, each time appending one more assistant turn with 300 character padding
    Then the state records iterations 50
    And tokensOriginal divided by tokensSent is greater than 10
