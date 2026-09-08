Feature: Provider routes small_model to local DS4 when needed
  As a user
  I want the small_model routed to the local DS4 server while macOS
  High Power Mode is active or the work Wi-Fi is connected, and
  always for the "local" provider
  So battery life is preserved and local inference is used when available

  Background:
    Given the provider module is loaded
    And work Wi-Fi is off

  Scenario: High Power Mode with DS4 up routes small_model to DS4
    Given pmset reports powermode "2"
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "ds4/glm-5.3-flash"

  Scenario: Work Wi-Fi with DS4 up routes small_model to DS4
    Given pmset reports powermode "0"
    And work Wi-Fi is connected
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "ds4/glm-5.3-flash"

  Scenario: High Power Mode off keeps configured small model
    Given pmset reports powermode "0"
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/z-ai/glm-5.3-flash"

  Scenario: High Power Mode with DS4 down keeps configured small model
    Given pmset reports powermode "2"
    And the DS4 server is not available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/z-ai/glm-5.3-flash"

  Scenario: Low Power Mode keeps configured small model
    Given pmset reports powermode "1"
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/z-ai/glm-5.3-flash"

  Scenario: local provider always routes DS4
    Given pmset reports powermode "0"
    And the DS4 server is not available
    And the configured small model is "ds4/glm-5.3-flash"
    When small_model is resolved for provider "local"
    Then small_model is "ds4/glm-5.3-flash"

  Scenario: Configured small model without flash stays unchanged
    Given pmset reports powermode "2"
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3"
    When small_model is resolved for provider "openrouter"
    Then small_model is "openrouter/z-ai/glm-5.3"

  Scenario: Missing pmset treats High Power Mode as off
    Given no pmset binary on PATH
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/z-ai/glm-5.3-flash"

  Scenario: Malformed pmset output treats High Power Mode as off
    Given pmset reports garbage
    And the DS4 server is available
    And the configured small model is "openrouter/z-ai/glm-5.3-flash"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/z-ai/glm-5.3-flash"
