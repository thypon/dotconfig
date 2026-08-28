Feature: xlazy
  Update and cross-build Void Linux packages from a void-packages
  checkout, deriving target arches from masterdir names and building
  in reflink COW clones.

  Scenario: No arguments prints usage and exits 1
    Given a void-packages checkout
    When xlazy runs with no arguments
    Then the usage line is printed and the script exits 1

  Scenario: Outside a void-packages repo dies
    Given the current directory is a git repository without xbps-src
    When xlazy runs with "pkg-a"
    Then the script exits 1 mentioning xbps-src

  Scenario: Unknown package is listed and marks failure
    Given a void-packages repo with no srcpkgs/ghost
    When xlazy runs with "ghost"
    Then the output lists ghost under "unknown packages"
    And the script exits 1

  Scenario: Native arch builds in a reflink clone of its masterdir
    Given a void-packages repo with masterdir for the host arch
    And package pkg-a builds for the host arch natively
    When xlazy runs with "pkg-a"
    Then masterdir-xlazy-<arch> is created with cp --reflink=always
    And xbps-src pkg runs in the clone and the package is listed as built

  Scenario: Foreign arch cross-compiles via -a in a host clone
    Given a void-packages repo with a foreign masterdir arch
    And package pkg-a supports cross for that arch
    When xlazy runs with "pkg-a"
    Then xbps-src -m clone -a <arch> pkg pkg-a runs
    And the clone is a COW copy of the host masterdir

  Scenario: nocross packages skip foreign arches
    Given a void-packages repo with a foreign masterdir arch
    And package pkg-a declares nocross
    When xlazy runs with "pkg-a"
    Then the foreign arch is listed under "skipped" with nocross reason

  Scenario: archs restriction filters allowed arches
    Given a void-packages repo with a foreign masterdir arch
    And package pkg-a restricts archs to x86_64
    When xlazy runs with "pkg-a"
    Then other arches are skipped with an archs reason

  Scenario: Update failure records a rollback point and fails
    Given xupdate fails for pkg-a
    When xlazy runs with "pkg-a"
    Then the output lists pkg-a under "update failures"
    And the pre-build commit is remembered for rollback

  Scenario: Build failure prints the last log lines
    Given xbps-src fails for pkg-a on the host arch
    When xlazy runs with "pkg-a"
    Then the last 80 log lines are printed
    And the script exits 1

  Scenario: Existing xlazy clone is reused
    Given masterdir-xlazy-<arch> already exists and is bootstrapped
    When xlazy runs with "pkg-a"
    Then no new clone is created

  # Replaced "Second xlazy invocation queues on the same arch": the
  # per-clone lock is an fd-based flock which a shim cannot emulate
  # (no /usr/bin/flock on macOS); the update lock path is asserted instead.
  Scenario: Package update runs under the shared update lock
    Given a void-packages repo with masterdir for the host arch
    And package pkg-a builds for the host arch natively
    When xlazy runs with "pkg-a"
    Then xupdate pkg-a runs while holding the update lock