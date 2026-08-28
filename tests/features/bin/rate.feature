Feature: rate
  Show currency exchange rates from rate.sx.

  Scenario: Fetches the currency page
    When rate runs with "btc"
    Then rate.sx/btc is fetched and its body is printed