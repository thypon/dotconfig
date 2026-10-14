Feature: Travel pause gate
  The plugin holds every outgoing LLM HTTP request while a pause flag exists
  in the state dir, and releases it as soon as the flag disappears. Local
  providers bypass the gate so local inference keeps working while traveling.

  Background:
    Given a fresh state dir
    And the plugin is created

  Scenario: request is held while the pause flag exists
    Given the pause flag exists
    When an http.request hook runs for provider "openrouter"
    Then the hook is still held after 3 polls

  Scenario: request is released when the pause flag is removed
    Given the pause flag exists
    When an http.request hook runs for provider "openrouter"
    And the pause flag is removed
    Then the hook returns
    And the gate logged a hold and a release

  Scenario: the auto pause flag also holds requests
    Given the auto pause flag exists
    When an http.request hook runs for provider "openrouter"
    Then the hook is still held after 3 polls
    And the manual pause flag does not exist

  Scenario: local provider bypasses the gate
    Given the pause flag exists
    When an http.request hook runs for provider "ds4"
    Then the hook returns without polling

  Scenario: loopback request URL bypasses the gate
    Given the pause flag exists
    When an http.request hook runs for provider "openrouter" against "http://localhost:8000/v1/chat/completions"
    Then the hook returns without polling

  Scenario: multiple held requests release together
    Given the pause flag exists
    When http.request hooks run for 3 requests
    And the pause flag is removed
    Then all held hooks return

  Scenario: the request is left untouched
    Given no pause flag exists
    When an http.request hook runs for provider "openrouter"
    Then the hook returns
    And the request is unchanged