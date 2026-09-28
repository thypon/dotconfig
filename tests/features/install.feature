Feature: macos install script
  install.sh syncs the services dir unprivileged and performs the
  privileged installs (Touch ID for sudo, hpm controller daemon) only
  when the live state differs from the repo.

  Background:
    Given a shimmed install environment

  Scenario: Nothing to do when touch id is enabled and controller is current
    Given the controller and plist are already installed
    When install.sh runs
    Then sudo is never invoked
    And the services dir is synced

  Scenario: Enabling touch id for sudo on first install
    When install.sh runs
    Then sudo writes the pam_tid line to sudo_local
    And sudo installs the controller and plist
    And the daemon is reloaded

  Scenario: Non-tty run prints manual commands and does nothing privileged
    When install.sh runs without a tty
    Then manual sudo commands including the pam_tid line are printed
    And sudo is never invoked
    And the services dir is synced

  Scenario: Stale installed controller triggers reinstall
    Given the controller and plist are already installed
    And the installed controller is stale
    When install.sh runs
    Then sudo installs the controller and plist
    And the daemon is reloaded
    And the pam file is not rewritten

  Scenario: Running twice performs privileged work only once
    When install.sh runs
    And install.sh runs again
    Then the controller was installed exactly once

  Scenario: Existing sudo_local without pam_tid keeps its content
    Given sudo_local exists with other auth config
    When install.sh runs
    Then the pam_tid line is appended
    And the existing pam content is preserved

  Scenario: ds4 launch agent is installed and bootstrapped when missing
    When install.sh runs
    Then the ds4 agent plist is installed in the user LaunchAgents dir
    And the ds4 agent is bootstrapped in the gui domain

  Scenario: Unchanged ds4 agent is not reloaded
    Given the ds4 agent plist is installed and current
    When install.sh runs
    Then the ds4 agent is not bootstrapped again

  Scenario: ds4 agent installs even without a tty
    When install.sh runs without a tty
    Then the ds4 agent plist is installed in the user LaunchAgents dir
