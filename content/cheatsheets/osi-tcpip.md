# OSI and TCP/IP model reference

| OSI layer      | Main concern                      | Four-layer TCP/IP grouping | Examples                                    |
| -------------- | --------------------------------- | -------------------------- | ------------------------------------------- |
| 7 Application  | Application semantics             | Application                | HTTP, DNS, SMTP, SSH                        |
| 6 Presentation | Representation and transformation | Application                | Encoding, serialization, encryption formats |
| 5 Session      | Dialog and session management     | Application                | Application session functions               |
| 4 Transport    | Endpoint communication            | Transport                  | TCP, UDP; QUIC over UDP                     |
| 3 Network      | Logical addressing and routing    | Internet                   | IPv4, IPv6, ICMP                            |
| 2 Data link    | Local framing and addressing      | Link                       | Ethernet MAC, 802.1Q                        |
| 1 Physical     | Signals and media                 | Link                       | Copper, fiber, radio                        |

This is a teaching mapping. Some references use a five-layer TCP/IP model, and real protocols do not always fit one OSI layer. Explain the specific function instead of treating every protocol placement as absolute.

Encapsulation example: application bytes become TCP stream segments, then IP packets, then link frames. At a routed boundary the link frame changes while the IP packet continues toward its selected destination, subject to forwarding updates and policy.

Sources: [RFC 1122](https://www.rfc-editor.org/rfc/rfc1122), [RFC 1123](https://www.rfc-editor.org/rfc/rfc1123).
