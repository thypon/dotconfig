Feature: gh-contributors
  List GitHub logins of contributors across the given repositories
  since a lookback window, defaulting to 365 days.

  Scenario: Resolves noreply email to login locally
    Given a repo with contributor 12345+octocat@users.noreply.github.com
    When gh-contributors runs on that repo
    Then the output contains "octocat"

  Scenario: Resolves private email via GitHub API
    Given a repo with contributor private@example.com
    And the commits API maps that email to login "realuser"
    When gh-contributors runs on that repo
    Then the output contains "realuser"

  Scenario: Same contributor across repos is listed once
    Given two repos sharing contributor octocat@users.noreply.github.com
    When gh-contributors runs on both
    Then "octocat" appears exactly once

  Scenario: Days argument overrides the default lookback
    Given a contributor active 400 days ago
    And a contributor active 10 days ago
    When gh-contributors runs with 30 and that repo
    Then only the recent contributor is listed