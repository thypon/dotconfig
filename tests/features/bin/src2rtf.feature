Feature: src2rtf
  Convert a source file to RTF with pygmentize.

  Scenario: Writes an RTF next to the source
    Given a file notes.py
    When src2rtf runs with notes.py
    Then notes.rtf exists
    And pygmentize used the rtf formatter with full options