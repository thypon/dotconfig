Feature: vpn
  Connect to a named OpenVPN config under /etc/openvpn using dtach.

  Scenario: Attaches openvpn to a per-config dtach socket
    When vpn runs with "work"
    Then dtach -A /tmp/vpnwork runs sudo openvpn /etc/openvpn/work.ovpn