Feature: xfixupdate
  Show void-updates build log lines for packages maintained by
  abc@pompel.me.

  Scenario: Prints log lines for maintained packages
    Given srcpkgs/pkg-a/template and pkg-b/template are maintained by abc@pompel.me
    And the build log has entries for pkg-a and pkg-c
    When xfixupdate runs
    Then the pkg-a log lines are printed
    And pkg-c lines are not printed

  Scenario: Package without log lines prints nothing for it
    Given srcpkgs/pkg-a/template is maintained by abc@pompel.me
    And the build log has no pkg-a entry
    When xfixupdate runs
    Then no pkg-a lines are printed and the script exits 0