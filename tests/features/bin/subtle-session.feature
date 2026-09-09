Feature: subtle-session
  Attach to (or create) a byobu session named subtle<N>, where N is
  the number of currently running clients whose instance matches
  the detected terminal emulator.

  Scenario: Launches a byobu session named after the client count
    Given a fake subtlext ruby library with 2 clients
    And a byobu command shim
    When subtle-session runs
    Then the script exits 0
    And byobu was invoked with session "subtle0"

  Scenario: The session name reflects the number of matching clients
    Given a fake subtlext ruby library with 2 clients
    And the terminal emulator is "Alacritty"
    And a byobu command shim
    When subtle-session runs
    Then byobu was invoked with session "subtle1"