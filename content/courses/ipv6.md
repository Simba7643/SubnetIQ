# 8. IPv6 and hierarchical planning

## Read and normalize 128 bits

Expanded IPv6 has eight groups of sixteen bits. **2001:0db8:0012:0034:0000:0000:0000:0001** becomes **2001:db8:12:34::1**. Remove group-leading zeros, then compress the longest zero-group run with ::. Use :: once at most. RFC 5952 canonical form uses lowercase, chooses the leftmost tied run, and does not compress a single zero group with ::.

Compressed and expanded text represent the same value, so compare parsed addresses rather than raw strings. A short-looking IPv6 address still contains 128 bits.

## Recognize scope and purpose

**::** is unspecified; **::1** is loopback. **fe80::/10** is link-local. **fc00::/7** is unique local space, with locally generated prefixes beginning in **fd00::/8**. **ff00::/8** is multicast, including scope information. Global-unicast-format space also contains special assignments such as documentation **2001:db8::/32**.

IPv6 has no broadcast. A /128 contains one address, and /64 contains exactly 2^64 addresses without subtracting two. Large counts require integer-safe representations rather than rounded floating-point values.

## Allocate a hierarchy

A /48 provides sixteen bits before /64, so it contains **65,536 /64s**. A /56 contains 256, and /60 contains sixteen. These count networks, not active devices.

From **2001:db8:1200::/48**, use **2001:db8:1200:10::/64** for staff, **:20::/64** for servers, and **:30::/64** for guests. The identifiers are hexadecimal: :10 means sixteen in decimal. Store the actual prefix and numeric index explicitly even when choosing memorable labels.

Keep ordinary LAN /64s for common SLAAC-based operation. A small host count is not a reason to use /120 on an ordinary LAN. RFC 6164 describes /127 inter-router point-to-point links, and /128 supports a single-address route.

## Address formation

Router Advertisements provide default-router information and can advertise prefixes. SLAAC combines suitable prefixes with locally generated identifiers and checks for duplicates. DHCPv6 can supply addresses, options, or delegated blocks, but does not replace RA default-router discovery.

Modified EUI-64 inserts FFFE into a MAC and flips the universal/local bit. **00:11:22:33:44:55** yields **0211:22ff:fe33:4455**. This is one method, not a requirement; stable opaque and temporary identifiers avoid direct MAC embedding.

## Exercise and answer

A delegation **2001:db8:abcd:1200::/56** has /64 identifiers ranging from fourth group **1200** through **12ff**. There are 256 children, ending with **2001:db8:abcd:12ff::/64**. A planner should navigate those prefixes without attempting to display every endpoint inside them.

## Standards

- [RFC 4291: architecture](https://www.rfc-editor.org/rfc/rfc4291)
- [RFC 5952: canonical text](https://www.rfc-editor.org/rfc/rfc5952)
- [RFC 6164: /127 links](https://www.rfc-editor.org/rfc/rfc6164)
- [RFC 4862: SLAAC](https://www.rfc-editor.org/rfc/rfc4862)
