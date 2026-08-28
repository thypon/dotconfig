Feature: xupdate
  Bump a Void Linux package template to the latest upstream version.

  Scenario: Updates version, resets revision, regenerates checksum, xbumps
    Given a void-packages repo with package pkg-a at version 1.0
    And xbps-src update-check reports 2.3
    When xupdate runs with "pkg-a"
    Then srcpkgs/pkg-a/template has version=2.3 and revision=1
    And xgensum -i runs on the template
    And xbump pkg-a runs

  Scenario: Already up to date exits 0 without changes
    Given a void-packages repo with package pkg-a already at the latest version
    When xupdate runs with "pkg-a"
    Then the output says the package is already updated
    And the template is untouched