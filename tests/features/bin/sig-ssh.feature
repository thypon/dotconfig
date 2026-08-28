Feature: sig-ssh
  Sign a file with an SSH private key and export the public key as
  PKCS8 for verification.

  Scenario: Produces a detached signature
    Given a file msg.txt and an SSH key at ~/.ssh/id_rsa
    When sig-ssh runs with msg.txt
    Then msg.txt.sig exists and was produced by openssl dgst -sign

  Scenario: Exports the public key as PKCS8
    Given a file msg.txt and an SSH key pair
    When sig-ssh runs with msg.txt
    Then a file "pub" contains the PKCS8 form of the public key

  Scenario: SSH_SIGNATURE overrides the key path
    Given SSH_SIGNATURE is /tmp/alt_key
    When sig-ssh runs with msg.txt
    Then /tmp/alt_key is used to sign