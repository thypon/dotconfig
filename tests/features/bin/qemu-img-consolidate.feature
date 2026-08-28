Feature: qemu-img-consolidate
  Consolidate a VM snapshot into its backing image.

  Scenario: Converts the snapshot and rotates the old image
    Given a snapshot for vm1 and an existing backing image
    When qemu-img-consolidate runs with "vm1"
    Then qemu-img convert writes IMAGE.new from the snapshot
    And the old image is rotated to IMAGE.old
    And IMAGE.new takes the backing image place

  Scenario: Missing snapshot prints a message and skips conversion
    Given no snapshot for vm1
    When qemu-img-consolidate runs with "vm1"
    Then the output says there is no snapshot
    And qemu-img is not invoked

  Scenario: Missing backing image is reported
    Given a snapshot for vm1 but no backing image
    When qemu-img-consolidate runs with "vm1"
    Then the output reports the missing image