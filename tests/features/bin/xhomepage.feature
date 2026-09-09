Feature: xhomepage
  Open the homepage of a void package from its repo metadata
  via xbps-query and xdg-open.

  Scenario: Opens the package homepage
    Given xbps-query reports homepage "https://xavings.github.io/pkg"
    When xhomepage runs with "pkg"
    Then the script exits 0
    And xdg-open was called with "https://xavings.github.io/pkg"

  Scenario: A package without homepage field passes no URL
    Given xbps-query reports no homepage
    When xhomepage runs with "pkg"
    Then the script exits 0
    And xdg-open received no URL