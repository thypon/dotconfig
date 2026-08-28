Feature: aosp-rehistory
  Find the commit in branch B history whose diff against branch A is
  minimal, using a moving-average filter to stop the search early.

  Scenario: Reports the minimum-diff commit
    Given a git repo with branch A and branch B
    And exactly one commit in branch B that nearly matches branch A
    When aosp-rehistory runs with -a A and -b B
    Then the output names that commit sha as "Minimum commit"

  Scenario: Stops searching when the moving average exceeds the threshold
    Given a git repo with branch A and branch B
    And commits after the minimum drifting far away
    When aosp-rehistory runs with -a A and -b B and -t 20
    Then the search stops before walking the whole history

  Scenario: CSV option appends the result row
    Given a git repo with branch A and branch B
    When aosp-rehistory runs with -a A and -b B and -c out.csv
    Then out.csv contains workdir, branches, winning sha and diff size