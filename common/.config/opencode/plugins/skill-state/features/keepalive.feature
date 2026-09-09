Feature: Runtime keep-alive
  opencode's agent loop is model-driven and small models randomly stop
  mid-task. The plugin must own loop continuation (paper Algorithm 1)
  by re-prompting the session while its skill state is still active.

  Background:
    Given a fake client recording prompts
    And the plugin is created with the fake client

  Scenario: idle while active sends a continuation prompt
    Given session "s1" is activated with patches 5
    When session "s1" emits idle
    Then the fake client sent 1 prompt to "s1"
    And state "s1" has nudges 1

  Scenario: progress between idles resets the stall counter
    Given session "s1" is activated with patches 5
    When session "s1" emits idle
    And session "s1" advances patches to 6
    When session "s1" emits idle
    Then the fake client sent 2 prompts to "s1"
    And state "s1" is still active

  Scenario: four idles without progress deactivate the session
    Given session "s1" is activated with patches 5
    When session "s1" emits idle
    And session "s1" emits idle
    And session "s1" emits idle
    And session "s1" emits idle
    Then the fake client sent 3 prompts to "s1"
    And state "s1" is inactive

  Scenario: the nudge preserves the agent that activated the session
    Given session "s1" is activated with patches 5
    And session "s1" runs agent "build"
    When session "s1" emits idle
    Then the fake client sent 1 prompt to "s1"
    And the nudge names agent "build"

  Scenario: idle on a completed session does nothing
    Given session "s1" is activated with patches 5
    And session "s1" is deactivated
    When session "s1" emits idle
    Then the fake client sent 0 prompts to "s1"
