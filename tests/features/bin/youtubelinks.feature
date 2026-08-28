Feature: youtubelinks
  Extract YouTube video IDs from a file as space-joined tokens.

  Scenario: Extracts IDs from watch URLs
    Given a file with https://www.youtube.com/watch?v=VIDEOID10XY and https://youtu.be/SHORTID99XY
    When youtubelinks runs with the file
    Then the output is "VIDEOID10XY SHORTID99XY"

  Scenario: Ignores non-YouTube links
    Given a file with https://vimeo.com/123 and one youtube link
    When youtubelinks runs with the file
    Then only the youtube ID is printed