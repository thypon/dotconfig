Feature: updateclock
  Sync the system clock from Google's HTTP Date header.

  Scenario: Sets the system date from the Date header
    Given curl returns header "Date: Wed, 26 Aug 2026 10:00:00 GMT"
    When updateclock runs
    Then sudo date -s receives that parsed date

  Scenario: Hardware clock is written and read back
    Given the system date was set
    When updateclock runs
    Then sudo hwclock -w --utc and hwclock -r --utc are invoked