Feature: aosp-updaterepo
  Point the current AOSP project directory at android.googlesource.com
  and fetch it.

  Scenario: Adds the android remote derived from the project path
    Given the working directory is $PROJECT/frameworks/base
    And no android remote exists
    When aosp-updaterepo runs with no argument
    Then the android remote is set to https://android.googlesource.com/platform/frameworks/base

  Scenario: Updates an existing android remote instead of failing
    Given the android remote already exists with a stale URL
    When aosp-updaterepo runs
    Then the android remote URL is updated and git fetch android runs

  Scenario: Optional argument overrides the project root
    Given the working directory is not under the default project
    When aosp-updaterepo runs with a temporary project root as argument
    Then the remote URL is derived relative to that project root