Feature: pdf-numpages
  Report the page count of every PDF below the current directory and
  the running total.

  Scenario: Prints per-file page counts and total
    Given PDFs doc1.pdf with 3 pages and doc2.pdf with 5 pages
    When pdf-numpages runs
    Then doc1.pdf shows NumberOfPages 3
    And doc2.pdf shows NumberOfPages 5
    And the output ends with "Total: 8"