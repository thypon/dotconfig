Feature: pattern-search
  Print files whose lines contain all given patterns in order.

  Scenario: File containing every pattern in order is printed
    Given a file log.txt with lines alpha, beta, gamma
    When pattern-search runs on log.txt with "alpha" and "gamma"
    Then log.txt is printed

  Scenario: File missing a pattern is not printed
    Given a file log.txt with lines alpha, gamma, delta
    When pattern-search runs on log.txt with "alpha" and "beta"
    Then log.txt is not printed

  Scenario: Directories matching the glob are skipped
    Given a file a.txt and a directory b.txt in the glob path
    When pattern-search runs with the glob and one pattern
    Then only a.txt is examined

  Scenario: Patterns must appear in the given order
    Given a file log.txt with lines gamma, beta, alpha
    When pattern-search runs on log.txt with "alpha" and "beta"
    Then log.txt is not printed