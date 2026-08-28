Feature: chromecastize
  Convert video files to Chromecast-playable formats with ffmpeg,
  marking processed files to avoid reprocessing.

  Background:
    Given mediainfo, ffmpeg and realpath are available

  Scenario: Missing mediainfo aborts with exit 1
    Given mediainfo is not installed
    When chromecastize runs with "movie.mkv"
    Then the script exits 1
    And the output says mediainfo is not available

  Scenario: Missing ffmpeg and avconv aborts with exit 1
    Given neither ffmpeg nor avconv is installed
    When chromecastize runs with "movie.mkv"
    Then the script exits 1

  Scenario: No arguments prints usage and exits 1
    When chromecastize runs with no arguments
    Then the chromecastize usage line is printed
    And the script exits 1

  Scenario: Unsupported extension is skipped
    When chromecastize runs with "notes.txt"
    Then ffmpeg is not invoked
    And the output says it is not a video format

  Scenario: Already-playable file is marked good without conversion
    Given a file movie.mkv with Matroska container, AVC video and AAC audio
    When chromecastize runs with "movie.mkv"
    Then ffmpeg is not invoked
    And movie.mkv is recorded in the processed_files list

  Scenario: File needing conversion is transcoded and original renamed to .bak
    Given a file movie.avi with AVI container, MPEG-4 Visual video and AC-3 audio
    When chromecastize runs with "movie.avi"
    Then ffmpeg is invoked producing movie.avi.mkv with h264 video and aac audio
    And movie.avi is renamed to movie.avi.bak
    And movie.avi.mkv is recorded in the processed_files list

  Scenario: Failed conversion removes the partial output
    Given a file broken.avi that fails ffmpeg conversion
    When chromecastize runs with "broken.avi"
    Then the partial broken.avi.mkv is deleted
    And broken.avi is not renamed

  Scenario: Previously generated file is skipped
    Given processed_files contains the realpath of movie.mkv
    When chromecastize runs with "movie.mkv"
    Then ffmpeg is not invoked

  Scenario: Directory argument processes contained video files
    Given a directory vids containing two supported videos
    When chromecastize runs with "vids"
    Then both videos are processed

  Scenario: mkv override forces the output container
    Given a file clip.mp4 with supported codecs inside MP4
    When chromecastize runs with "--mkv" and "clip.mp4"
    Then ffmpeg is invoked writing clip.mp4.mkv