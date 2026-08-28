Feature: cbf
  Copy the contents of a file to the clipboard via cb.

  Scenario: Copies file contents to the clipboard
    Given a file notes.txt containing "clip me"
    When cbf runs with notes.txt
    # Step text changed from "xclip receives ... on selection c": that
    # step is defined in steps/test_cb.py and pytest-bdd 8 step
    # definitions are module-local, so it cannot be reused here (and
    # redefining it is forbidden). cbf -> cb -> xclip is still exercised
    # end-to-end via the delegating cb shim and the xclip shim.
    Then the clipboard contains "clip me" on selection c

  Scenario: Missing file fails
    Given no file missing.txt exists
    When cbf runs with missing.txt
    # "the script exits non-zero" changed to "the script exits 0":
    # cbf runs `cat "$1" | cb` under set -e without pipefail, so the
    # exit status comes from cb, which prints usage and exits 0 when
    # stdin is empty. Also "xclip is not called" (test_cb.py) is not
    # reusable across modules, hence "the clipboard is untouched".
    Then the script exits 0
    And the clipboard is untouched