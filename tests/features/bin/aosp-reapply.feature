Feature: aosp-reapply
  Replay branch B commits onto branch A and classify each Bug-tagged
  commit as Applied or Missing by comparing cherry-pick result sizes.

  Scenario: Commit whose cherry-pick produces the same change is Applied
    Given a git repo with branch A and branch B
    And a commit on branch B carrying "Bug: 123" that is already in branch A
    When aosp-reapply runs with -a A and -b B
    Then the commit is reported with status Applied

  Scenario: Commit absent from branch A is Missing
    Given a git repo with branch A and branch B
    And a commit on branch B carrying "Bug: 456" that conflicts with branch A
    When aosp-reapply runs with -a A and -b B
    Then the commit is reported with status Missing

  Scenario: Only commits with Bug tags are reported
    Given a git repo with branch A and branch B
    And a commit on branch B without a Bug tag
    When aosp-reapply runs with -a A and -b B
    Then no output line is produced for that commit

  Scenario: CSV option appends results to a file instead of stdout
    Given a git repo with branch A and branch B
    And a Bug-tagged commit on branch B
    When aosp-reapply runs with -a A and -b B and -c results.csv
    Then results.csv contains one line for the commit

  Scenario: Workdir option operates on another repository
    Given a git repo in a scratch directory with branch A and branch B
    And the current directory is not a git repository
    When aosp-reapply runs with -w the scratch repo and -a A and -b B
    Then the command succeeds using the scratch repo