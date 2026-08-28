Feature: extractimage
  Export a Docker image filesystem and extract it into the current
  directory.

  Scenario: Exports the image container filesystem into PWD
    Given docker has image alpine
    When extractimage runs with "alpine"
    Then docker runs the image with entrypoint true
    And the exported tar is extracted into the current directory
    And etc/sudoers.d is created in the current directory