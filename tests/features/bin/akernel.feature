Feature: akernel
  Compile an Android kernel and bundle the zImage with device tree
  blobs derived from the kernel .config MSM arch options.

  Scenario: Build concatenates zImage with each matching dtb
    Given a kernel tree with an MSM arch enabled in .config
    And device tree sources matching the configured arch
    When akernel runs
    Then each matching dts is compiled to a dtb with dtc
    And each dtb is appended to the zImage copy in /tmp

  Scenario: Build produces a boot image via droidtools
    Given a kernel tree with an MSM arch enabled in .config
    When akernel runs
    Then the bundled image is unpacked and rebuilt as out.img using droidtools