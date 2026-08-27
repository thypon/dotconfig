Feature: Provider routes small_model to local DS4 only in High Power Mode
  As a user
  I want the small_model routed to the local DS4 server only while macOS
  High Power Mode is active, and always for the "local" provider
  So battery life is preserved and local inference is used when available

  Background:
    Given the provider module is loaded

  Scenario: High Power Mode with DS4 up routes small_model to DS4
    Given pmset reports powermode "2"
    And the DS4 server is available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "ds4/deepseek-v4-flash"

  Scenario: High Power Mode off keeps configured small model
    Given pmset reports powermode "0"
    And the DS4 server is available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/deepseek/deepseek-v4-flash-0731"

  Scenario: High Power Mode with DS4 down keeps configured small model
    Given pmset reports powermode "2"
    And the DS4 server is not available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/deepseek/deepseek-v4-flash-0731"

  Scenario: Low Power Mode keeps configured small model
    Given pmset reports powermode "1"
    And the DS4 server is available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/deepseek/deepseek-v4-flash-0731"

  Scenario: local provider always routes DS4
    Given pmset reports powermode "0"
    And the DS4 server is not available
    And the configured small model is "ds4/deepseek-v4-flash"
    When small_model is resolved for provider "local"
    Then small_model is "ds4/deepseek-v4-flash"

  Scenario: Configured small model without deepseek stays unchanged
    Given pmset reports powermode "2"
    And the DS4 server is available
    And the configured small model is "openrouter/glm-5.3-flash"
    When small_model is resolved for provider "openrouter"
    Then small_model is "openrouter/glm-5.3-flash"

  Scenario: Missing pmset treats High Power Mode as off
    Given no pmset binary on PATH
    And the DS4 server is available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/deepseek/deepseek-v4-flash-0731"

  Scenario: Malformed pmset output treats High Power Mode as off
    Given pmset reports garbage
    And the DS4 server is available
    And the configured small model is "openrouter/deepseek/deepseek-v4-flash-0731"
    When small_model is resolved for provider "anthropic"
    Then small_model is "openrouter/deepseek/deepseek-v4-flash-0731"
