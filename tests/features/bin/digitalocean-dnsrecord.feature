Feature: digitalocean-dnsrecord
  Point a DNS A record at a DigitalOcean droplet's IPv4 address.

  Scenario: Creates an A record with the droplet IP
    Given droplet web1 has IP 203.0.113.10
    And domain example.com has no A record for web1
    When digitalocean-dnsrecord runs with "web1" and "example.com"
    Then an A record web1 -> 203.0.113.10 is created in example.com

  Scenario: Replaces an existing stale A record
    Given droplet web1 has IP 203.0.113.10
    And domain example.com already has A record web1 -> 198.51.100.1
    When digitalocean-dnsrecord runs with "web1" and "example.com"
    Then the old A record is deleted
    And a new A record web1 -> 203.0.113.10 is created

  Scenario: Uses the tugboat configured access token
    Given tugboat configuration holds a token
    When digitalocean-dnsrecord runs with "web1" and "example.com"
    Then API calls authenticate with the tugboat token