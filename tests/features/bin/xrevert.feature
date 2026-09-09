Feature: xrevert
  Revert the latest commit of a void srcpkgs package template and
  record the reverted version_revision in a reverts= line, keeping
  any prior reverts entries when VAR is set.

  Scenario: Reverts the latest template commit and records the reverts entry
    Given a void git repo
    And package "foo" template at version "1.0.0" revision "1"
    And package "foo" template is bumped to revision "2"
    When xrevert runs with "foo"
    Then the script exits 0
    And the template records reverts "1.0.0_2"
    And the template keeps version "1.0.0" and revision "1"
    And the latest commit is a revert

  Scenario: Existing reverts entries are kept when VAR is set
    Given a void git repo
    And package "foo" template at version "1.0.0" revision "1" with reverts "1.0.1_1"
    And package "foo" template is bumped to revision "2"
    When xrevert runs with "foo" with VAR set
    Then the script exits 0
    And the template records reverts "1.0.0_2 1.0.1_1"
    And the template keeps version "1.0.0" and revision "1"

  Scenario: An unknown package fails without reverting
    Given a void git repo
    When xrevert runs with "nosuch"
    Then the script exits non-zero
    And the repo has a single commit