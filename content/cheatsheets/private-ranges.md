# Private and selected special-purpose ranges

| Prefix          | Purpose            | Operational meaning                                    |
| --------------- | ------------------ | ------------------------------------------------------ |
| 10.0.0.0/8      | RFC 1918 private   | Internal reuse; check overlap when connecting networks |
| 172.16.0.0/12   | RFC 1918 private   | Second octets 16 through 31 only                       |
| 192.168.0.0/16  | RFC 1918 private   | Contains 256 /24 networks                              |
| 100.64.0.0/10   | RFC 6598 shared    | Provider shared space; different from RFC 1918         |
| 127.0.0.0/8     | IPv4 loopback      | Local host                                             |
| 169.254.0.0/16  | IPv4 link-local    | Single-link scope; selection restrictions apply        |
| 192.0.2.0/24    | Documentation      | Example addresses                                      |
| 198.51.100.0/24 | Documentation      | Example addresses                                      |
| 203.0.113.0/24  | Documentation      | Example addresses                                      |
| ::1/128         | IPv6 loopback      | Local host                                             |
| fe80::/10       | IPv6 link-local    | Include interface zone when needed                     |
| fc00::/7        | Unique local       | Locally generated prefixes use fd00::/8                |
| ff00::/8        | IPv6 multicast     | Group and scope-dependent behavior                     |
| 2001:db8::/32   | IPv6 documentation | Examples, not production assignment                    |

This selected table is not the complete registry. Nonprivate does not establish global reachability or assignment rights.

Sources: [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918), [RFC 6598](https://www.rfc-editor.org/rfc/rfc6598), [IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry/), [IPv6 registry](https://www.iana.org/assignments/iana-ipv6-special-registry/).
