# Common service ports

Ports must be interpreted with their transport. The actual listening application may differ from the common registered use.

| Port | Transport | Service                       | Security note                                                                                 |
| ---: | --------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
|   20 | TCP       | FTP data                      | FTP does not encrypt credentials or content; prefer a protected replacement.                  |
|   21 | TCP       | FTP control                   | Disable anonymous write access and use encrypted file transfer.                               |
|   22 | TCP       | SSH                           | Prefer keys, restrict administrative sources, and review host-key changes.                    |
|   23 | TCP       | Telnet                        | Credentials and traffic are plaintext; replace with SSH.                                      |
|   25 | TCP       | SMTP                          | Prevent open relays; require appropriate transport security and anti-abuse controls.          |
|   53 | UDP       | DNS                           | Restrict recursive service to intended clients; consider DNSSEC validation.                   |
|   53 | TCP       | DNS                           | TCP is required for robust DNS operation; restrict zone transfers.                            |
|   67 | UDP       | DHCP server                   | Use DHCP snooping where supported to limit rogue servers.                                     |
|   68 | UDP       | DHCP client                   | Treat address and gateway options as untrusted on unknown networks.                           |
|   69 | UDP       | TFTP                          | Use only isolated management or provisioning networks.                                        |
|   80 | TCP       | HTTP                          | Redirect sensitive applications to HTTPS and avoid sending credentials.                       |
|   88 | TCP/UDP   | Kerberos                      | Protect domain controllers and synchronize time; monitor abnormal ticket activity.            |
|  110 | TCP       | POP3                          | Prefer implicit TLS on port 995 or enforced STARTTLS.                                         |
|  123 | UDP       | NTP                           | Restrict unnecessary public query features and use trusted time sources.                      |
|  135 | TCP       | Microsoft RPC endpoint mapper | Restrict to managed networks; an allowed endpoint may require additional dynamic ports.       |
|  137 | UDP       | NetBIOS name service          | Disable if unnecessary and avoid exposure outside trusted networks.                           |
|  138 | UDP       | NetBIOS datagram              | Restrict broadcasts and retire legacy dependencies when possible.                             |
|  139 | TCP       | NetBIOS session               | Prefer current SMB and restrict access to authorized clients.                                 |
|  143 | TCP       | IMAP                          | Prefer implicit TLS on port 993 or enforced STARTTLS.                                         |
|  161 | UDP       | SNMP                          | Prefer SNMPv3 with authentication and privacy; avoid public community strings.                |
|  162 | UDP       | SNMP trap                     | Restrict senders and validate monitoring configuration.                                       |
|  179 | TCP       | BGP                           | Apply explicit peer controls, prefix filters, maximum-prefix limits, and route validation.    |
|  389 | TCP/UDP   | LDAP                          | Use protected directory access and prevent unauthenticated enumeration.                       |
|  443 | TCP       | HTTPS                         | Validate certificates; encryption does not establish that application content is trustworthy. |
|  443 | UDP       | HTTP/3                        | Account for UDP in policy and observability; do not assume all HTTPS uses TCP.                |
|  445 | TCP       | SMB                           | Use current SMB, signing where required, least privilege, and restricted exposure.            |
|  465 | TCP       | Message submission over TLS   | Require authenticated users and validate the server certificate.                              |
|  500 | UDP       | IKE                           | Restrict peers where possible and select current authentication and cryptography.             |
|  514 | UDP       | Syslog                        | Traffic is commonly plaintext and unauthenticated; prefer protected logging transport.        |
|  546 | UDP       | DHCPv6 client                 | Do not expect DHCPv6 alone to provide the default router; Router Advertisements do that.      |
|  547 | UDP       | DHCPv6 server                 | Use appropriate first-hop controls and trusted relay paths.                                   |
|  587 | TCP       | Message submission            | Require authentication and enforce TLS before accepting credentials.                          |
|  636 | TCP       | LDAPS                         | Validate certificate identity and limit directory permissions.                                |
|  853 | TCP       | DNS over TLS                  | Resolver trust and DNSSEC validation are separate from transport encryption.                  |
|  853 | UDP       | DNS over QUIC                 | Encrypted transport still reveals network endpoints and requires a trusted resolver.          |
|  993 | TCP       | IMAPS                         | Enforce certificate validation and strong account authentication.                             |
|  995 | TCP       | POP3S                         | Protect account access and avoid retaining unnecessary local mail copies.                     |
| 1433 | TCP       | Microsoft SQL Server          | Restrict to application and management networks; enforce authentication and encryption.       |
| 1812 | UDP       | RADIUS authentication         | Protect the transport and shared secrets; do not expose it unnecessarily.                     |
| 1813 | UDP       | RADIUS accounting             | Protect accounting integrity and align retention with operational needs.                      |
| 2049 | TCP/UDP   | NFS                           | Restrict exports and prefer authenticated protected configurations.                           |
| 3306 | TCP       | MySQL                         | Use least-privilege accounts and restrict network reachability.                               |
| 3389 | TCP/UDP   | RDP                           | Use gateway or VPN controls and strong authentication; restrict public exposure.              |
| 4500 | UDP       | IPsec NAT traversal           | Validate peer configuration and permit only intended VPN use.                                 |
| 5432 | TCP       | PostgreSQL                    | Require appropriate TLS, narrow role grants, and host-based access controls.                  |
| 5900 | TCP       | VNC                           | Use a secure implementation or protected tunnel and strong authentication.                    |
| 6379 | TCP       | Redis                         | Bind to trusted interfaces, require authentication, and avoid public exposure.                |
| 8080 | TCP       | HTTP alternate                | Treat administrative consoles as sensitive and enforce access control.                        |
| 8443 | TCP       | HTTPS alternate               | Certificate verification and application access controls remain necessary.                    |

IANA categories: system 0–1023; user 1024–49151; dynamic/private 49152–65535. Operating-system ephemeral ranges may differ.

Source: [IANA service-name and port registry](https://www.iana.org/assignments/service-names-port-numbers/).
