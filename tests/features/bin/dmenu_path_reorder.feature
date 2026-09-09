Feature: dmenu_path_reorder
  Move a program to the top of the dmenu_run cache file so it
  appears first in the dmenu launcher, and echo the program name.

  Scenario: Moves the selected program to the top of the cache
    Given a dmenu_run cache with programs vim, git and ls
    When dmenu_path_reorder runs with "ls"
    Then the script exits 0
    And the cache lists "ls" first
    And stdout names the program "ls"

  Scenario: An unknown program is prepended to the cache
    Given a dmenu_run cache with programs vim and git
    When dmenu_path_reorder runs with "zathura"
    Then the script exits 0
    And the cache lists "zathura" first

  Scenario: Without a program name the cache is untouched
    Given a dmenu_run cache with programs vim and git
    When dmenu_path_reorder runs with no arguments
    Then the script exits 0
    And the cache still lists vim, git in order