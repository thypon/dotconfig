Feature: pdfpages
  Sum the page counts of all PDFs in the current directory.

  Scenario: Prints the sum of page counts
    Given PDFs a.pdf with 2 pages and b.pdf with 7 pages
    When pdfpages runs
    Then the output is 9

  Scenario: No PDFs yields an empty result without crashing
    Given no PDF files in the current directory
    When pdfpages runs
    Then the script does not print a page sum