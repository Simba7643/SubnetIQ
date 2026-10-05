# 1. IP addressing from the ground up

## Address, prefix, and context

An IP address identifies an interface within an address space. The prefix identifies its network boundary. One device can have several interfaces and multiple addresses, with separate IPv4 and IPv6 routes. An address without its prefix and routing context is incomplete planning information.

IPv4 uses 32 bits, usually written as four decimal octets. IPv6 uses 128 bits, displayed in hexadecimal groups. Both provide connectionless packet delivery rather than promising every packet will arrive in order. A transport such as TCP can add reliable stream delivery above IP.

## Follow a local packet

A workstation has **192.0.2.10/24** and gateway **192.0.2.1**. Its local network is 192.0.2.0/24. To contact **192.0.2.20**, it resolves the peer's MAC through ARP and sends an Ethernet frame directly to that peer. The packet's destination IP and the frame's destination MAC describe different layers of the same communication.

To contact **198.51.100.40**, the workstation normally selects its gateway. It resolves the gateway's local MAC, not the remote server's MAC. The IP destination remains 198.51.100.40 while the local frame addresses the router. Routed links replace link-layer encapsulation as the packet continues toward its destination.

IPv6 uses Neighbor Discovery instead of ARP and learns default routers through Router Advertisements. The distinction between final destination and immediate next hop remains essential.

## Address purpose is another dimension

A syntactically valid address is not automatically globally assignable. Private IPv4 blocks support internal reuse. Loopback refers to the local host. Link-local addresses remain on one link. Documentation blocks are reserved for examples. Provider shared space differs from RFC 1918 private space.

Classification therefore needs purpose and scope alongside ordinary address mathematics. Being outside a private range does not prove reachability or ownership. All addresses in this lesson are documentation examples.

## Worked check

A host uses **192.0.2.130/25** with gateway **192.0.2.129**. Is **192.0.2.30** local? A /25 splits the /24 into .0–.127 and .128–.255. The host belongs to the second block and .30 to the first, so they need routing despite sharing their first three octets.

The reverse mistake also occurs: a host with an overly broad mask may attempt ARP for a destination that should be reached through a router. Correcting the prefix can fix the path without changing the destination address.

## Practice and answers

1. What extra information is needed with 192.0.2.130? Its prefix and routing context.
2. Does an off-link packet's destination IP become the gateway IP? No; the gateway is the link next hop.
3. Does a successful ping prove an application works? No; it proves responses to particular probes, not service authentication or application health.

Open the IPv4 calculator with 192.0.2.130/25 and compare its complete range with its usable-host range.

## Standards

- [RFC 791: IPv4](https://www.rfc-editor.org/rfc/rfc791)
- [RFC 8200: IPv6](https://www.rfc-editor.org/rfc/rfc8200)
- [RFC 826: ARP](https://www.rfc-editor.org/rfc/rfc826)
- [RFC 4861: Neighbor Discovery](https://www.rfc-editor.org/rfc/rfc4861)
