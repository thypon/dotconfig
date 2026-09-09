Feature: dotfiles update git hook
  The post-<action> git hook symlinks repo config files into $HOME,
  copies provider-managed opencode plugins as real files, syncs
  command/prompt templates with rsync, re-runs the provider, and
  installs plugin dependencies.

  Scenario: Common config files are symlinked into home
    Given a fake repo toplevel with common files
    When the update hook runs
    Then the hook exits 0
    And the home path ".config/foo/bar.conf" is a symlink into the repo
    And the home path ".gitconfig" is a symlink into the repo
    And the home path "node_modules/dep/index.js" does not exist
    And the home path "services/svc.sh" does not exist
    And the home path "install.sh" does not exist

  Scenario: An existing home .gitconfig is not overwritten
    Given a fake repo toplevel with common files
    And the home already has a .gitconfig
    When the update hook runs
    Then the hook exits 0
    And the home path ".gitconfig" is a regular file with content "user config"

  Scenario: Provider-managed opencode plugins are copied, not symlinked
    Given a fake repo toplevel with common files
    When the update hook runs
    Then the hook exits 0
    And the home path ".config/opencode/plugins/testplug/plugin.js" is a regular copy

  Scenario: Command and prompt templates are synced as real copies
    Given a fake repo toplevel with common files
    When the update hook runs
    Then the hook exits 0
    And the home path ".config/opencode/commands/greet.tmpl" is a regular copy
    And the home path ".pi/agent/prompts/hi.tmpl" is a copy of the repo file ".config/pi/prompts/hi.tmpl"

  Scenario: Provider re-resolution runs when the provider is installed
    Given a fake repo toplevel with common files
    And the provider binary is installed in home
    When the update hook runs
    Then the hook exits 0
    And the provider re-resolution ran

  Scenario: The macos installer runs on darwin
    Given a fake repo toplevel with common files
    And a fake macos installer in the toplevel
    When the update hook runs
    Then the hook exits 0
    And the macos installer ran

  Scenario: A missing macos directory is skipped
    Given a fake repo toplevel with common files
    When the update hook runs
    Then the hook exits 0
    And the hook reports no macos directory

  Scenario: Symlinked ancestor directories are not traversed
    Given a fake repo toplevel with common files
    And the pi config directory in home is a symlink
    When the update hook runs
    Then the hook exits 0
    And the home path ".config/pi/prompts/hi.tmpl" does not exist
    And the pi config directory is still a symlink
    And the home path ".pi/agent/prompts/hi.tmpl" is a copy of the repo file ".config/pi/prompts/hi.tmpl"