Feature: brave-models syncs Venice and ds4 models into Brave Leo
  brave-models fetches the Venice.ai text-model catalog, keeps the newest
  flagship model per family (plus flash companions, e2ee preferred), adds the
  local ds4-server models, and writes them into every Brave channel/profile
  as Leo custom models with ds4 as the default Leo model.

  Background:
    Given a fake Brave installation with Nightly, Beta, and Development channels
    And a local Brave development build exists
    And the Brave safe storage keychain entry exists
    And the Venice API answers with a text-model catalog
    And the ds4 server answers with its model list

  Scenario: Profiles are discovered dynamically including the Leo agent profile
    When brave-models runs with --dry-run
    Then the output lists the "Leo AI Content Agent" profile
    And the output does not list the "Guest" profile
  Scenario: Only the latest flagship models are selected
    When brave-models runs with --dry-run
    Then the selection includes "claude-opus-5-5"
    And the selection includes "e2ee-glm-5-3-p"
    And the selection includes "deepseek-v4-1-flash"
    And the selection includes "deepseek-v4-pro-0813"
    And the selection includes "grok-4-7"
    And the selection includes "qwen-3-8-max"
    And the selection includes "qwen-3-8-flash"
    And the selection includes "e2ee-kimi-k3-p"
    And the selection includes "gemini-3-8-flash"
    And the selection includes "openai-gpt-61-sol"
    And the selection does not include "claude-opus-5-5-fast"
    And the selection does not include "grok-4-20"
    And the selection does not include "llama-3.3-70b"
    And the selection does not include "olafangensan-glm-4.7-flash-heretic"
    And the selection does not include "gpt-oss-120b"
    And the selection does not include "venice-uncensored-1-2"


  Scenario: Models are injected into every profile keeping user entries
    Given a Venice API key is available
    When brave-models runs with --yes
    Then the Nightly "Default" preferences contain the Venice models
    And the Nightly "Default" preferences contain the ds4 models
    And the Nightly "Profile 3" preferences keep the user model "test"
    And the Nightly "Leo AI Content Agent" preferences contain the injected models
    And the Beta "Beta" preferences contain the injected models

  Scenario: The local Development build channel is injected too
    Given a Venice API key is available
    When brave-models runs with --yes
    Then the Development "Default" preferences contain the injected models
    And the Development "Default" default model key is the ds4 model key
    And the Development Local State contains "brave-ai-chat-allow-private-ips@1"

  Scenario: The Development channel Venice keys use the mock keychain password
    Given a Venice API key is available
    When brave-models runs with --yes
    Then the Development Venice models store the mock-keychain api key
    And the Nightly Venice models store the real-keychain api key

  Scenario: The default Leo model is the local ds4 model
    Given a Venice API key is available
    When brave-models runs with --yes
    Then the Nightly "Default" default model key is the ds4 model key

  Scenario: The private IP flag is enabled for the ds4 endpoint
    Given a Venice API key is available
    When brave-models runs with --yes
    Then the Nightly Local State contains "brave-ai-chat-allow-private-ips@1"

  Scenario: Brave is quit and relaunched around the update
    Given Brave Nightly is running
    And a Venice API key is available
    When brave-models runs with --yes
    Then Brave Nightly is quit via osascript
    And Brave Nightly is relaunched via open

  Scenario: The development build is quit and relaunched with the mock keychain
    Given the local Development build is running
    And a Venice API key is available
    When brave-models runs with --yes
    Then the development build is quit via osascript
    And the development build is relaunched via open with the mock keychain

  Scenario: A running Brave that refuses to quit skips that channel
    Given Brave Nightly is running and refuses to quit
    And a Venice API key is available
    When brave-models runs with --yes
    Then the Nightly "Default" preferences are unchanged
    And the script exits 0

  Scenario: Without ds4 the strongest Venice model becomes the default
    Given the ds4 server is unreachable
    And a Venice API key is available
    When brave-models runs with --yes
    Then no ds4 models are injected
    And the Nightly "Default" default model key is the strongest Venice model key

  Scenario: Dry run writes nothing
    When brave-models runs with --dry-run
    Then no backup files are created
    And the Nightly "Default" preferences are unchanged

  Scenario: The existing encrypted Venice API key is reused
    Given an existing Venice custom model with encrypted key
    When brave-models runs with --yes
    Then the written Venice models keep that api key

  Scenario: An undecryptable stored Venice key is passed through with a warning
    Given an existing Venice custom model with encrypted key
    When brave-models runs with --yes
    Then the written Venice models keep that api key
    And the Development Venice models keep that api key
    And the output warns that the mock-keychain build cannot use the stored key

  Scenario: A plaintext API key is encrypted with the Brave safe storage key
    Given the Brave safe storage keychain entry exists
    When brave-models runs with --api-key secret-venice-key --yes
    Then the written Venice models store an encrypted api key
