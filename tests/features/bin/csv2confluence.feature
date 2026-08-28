Feature: csv2confluence
  Convert a CSV file into Confluence wiki table markup.

  Scenario: First line becomes a header row using || separators
    Given a CSV file with header "name,age"
    When csv2confluence runs with the file
    Then the first output line is "||name||age||"

  Scenario: Following lines become body rows using | separators
    Given a CSV file with header and a data row "alice,30"
    When csv2confluence runs with the file
    Then the data row prints as "|alice|30|"

  Scenario: Whitespace around fields is stripped
    Given a CSV file with line " a,b "
    When csv2confluence runs with the file
    Then the output fields contain no surrounding spaces