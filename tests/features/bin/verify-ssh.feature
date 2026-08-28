Feature: verify-ssh
  Verify a file signature produced by sig-ssh against the exported
  PKCS8 public key.

  Scenario: Valid signature verifies successfully
    Given a signed file msg.txt with its .sig
    And a "pub" PKCS8 public key matching the signer
    When verify-ssh runs with msg.txt
    Then openssl dgst -verify succeeds

  Scenario: Tampered file fails verification
    Given a signed file msg.txt that was modified after signing
    When verify-ssh runs with msg.txt
    Then openssl dgst -verify fails