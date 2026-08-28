Feature: provider
  Deploy the opencode/pi dynamic configuration from
  dynamic-models.jsonc with dynamic/* tokens resolved, and sync
  generated commands. HPM small-model routing is covered separately.

  Scenario: Renders the template with the configured provider
    Given a dynamic-models.jsonc with providers anthropic and local
    And the deployed settings name the anthropic provider
    When provider runs with "anthropic"
    Then the deployed config has model tokens resolved to the anthropic models

  Scenario: No-arg run reuses the last deployed provider
    Given the settings file already names provider openrouter
    When provider runs with no arguments
    Then the template is resolved against openrouter again

  Scenario: Unknown provider name fails loudly
    Given a dynamic-models.jsonc with providers anthropic and local
    When provider runs with "nosuch"
    Then the script exits non-zero
    And no config is deployed

  Scenario: Commands are synced as resolved copies
    Given the commands template directory has dynamic tokens
    And the settings file already names provider anthropic
    When provider runs with no arguments
    Then every command file under the live opencode config is a resolved copy