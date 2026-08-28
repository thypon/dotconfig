Feature: sublimify-all
  Set Sublime Text 4 as default app for every language extension known
  to GitHub Linguist.

  Scenario: Fetches extensions and assigns them via duti
    Given a linguist languages.yml with extensions py, rb and md
    When sublimify-all runs
    Then duti -s com.sublimetext.4 runs for py, rb and md with role all