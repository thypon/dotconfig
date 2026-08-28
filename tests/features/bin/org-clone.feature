Feature: org-clone
  Clone or pull every non-archived repo of a GitHub organisation,
  sorted into visibility directories.

  Scenario: Last argument is the organisation
    Given gh repo list returns repos acme/api (PRIVATE) and acme/cli (PUBLIC)
    When org-clone runs with "acme"
    Then gh repo list is called with acme and --no-archived

  Scenario: Public repos clone into the plain directory
    Given gh repo list returns acme/cli (PUBLIC)
    And no directory cli exists
    When org-clone runs with "acme"
    Then gh repo clone acme/cli into cli

  Scenario: Private repos clone under private/
    Given gh repo list returns acme/api (PRIVATE)
    And no directory private/api exists
    When org-clone runs with "acme"
    Then gh repo clone acme/api into private/api

  Scenario: Internal repos clone under internal/
    Given gh repo list returns acme/lib (INTERNAL)
    When org-clone runs with "acme"
    Then gh repo clone acme/lib into internal/lib

  Scenario: Existing directories are pulled instead of cloned
    Given gh repo list returns acme/cli (PUBLIC)
    And directory cli is an existing git repo
    When org-clone runs with "acme"
    Then git pull runs in cli
    And gh repo clone is not called

  Scenario: Extra flags before the org are passed to git
    When org-clone runs with --depth and 1 and "acme"
    Then the org argument used is acme