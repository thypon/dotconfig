Feature: denoise
  Denoise a video with ffmpeg hqdn3d video filter and bandpass audio.

  Scenario: Runs ffmpeg with denoise settings
    When denoise runs with "in.mkv" and "out.mkv"
    Then ffmpeg is invoked with hqdn3d=4.0:3.0:6.0:4.5
    And libx264 crf 24 preset slow is used for video
    And aac 192k is used for audio

  Scenario: Output path is passed through
    When denoise runs with "in.mkv" and "out.mkv"
    Then ffmpeg writes to out.mkv