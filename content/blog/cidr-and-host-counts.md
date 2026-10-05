---
id: cidr-and-host-counts
title: 'CIDR and host counts: calculate the range before counting devices'
description:
  Work through a /27, distinguish total addresses from usable capacity, and handle /31, /32, and allocation policies
  correctly.
category: IPv4 fundamentals
publishedAt: '2026-10-04'
readingMinutes: 7
---

## Start with the full address range

A reliable subnet calculation answers two separate questions: which addresses belong to the prefix, and which of those addresses your environment permits you to assign. Begin with the complete range. Apply the operational policy afterward. This keeps a straightforward binary calculation from being confused with a device-capacity estimate.

Consider `10.24.3.77/27`. The address is a point inside a block; it is not the block's starting address. We will find that block, count it, and decide what its usable capacity means.

## Read the prefix as a bit boundary

IPv4 contains 32 bits. In `/27`, the first 27 bits identify the prefix and the remaining five bits vary within it. Five independently variable bits produce `2^5 = 32` address combinations. The slash number does not identify an old class, a VLAN number, or the number of hosts. [RFC 4632](https://www.rfc-editor.org/rfc/rfc4632.html) describes classless prefix notation.

A `/27` mask is `255.255.255.224`. Its first three octets are entirely network bits. The final octet, `224`, is binary `11100000`. This gives us a convenient place to inspect the boundary without writing all 32 address bits every time.

The final address octet is `77`, or binary `01001101`. Apply a bitwise AND with the mask:

```text
Address octet: 01001101
Mask octet:    11100000
Network octet: 01000000
```

The resulting octet is decimal `64`, so the network is `10.24.3.64/27`. The original host-bit pattern is not preserved as part of the network; all five host bits are cleared by the AND.

## Check the answer with block size

There is a second calculation that should agree with the binary result. In the partially masked octet, subtract the mask value from 256:

`256 - 224 = 32`

The boundaries in this octet are `0, 32, 64, 96, 128, 160, 192, 224`. The value 77 lies between 64 and 95. Therefore the complete block starts at `10.24.3.64` and ends at `10.24.3.95`.

The last address follows from adding the block size minus one: `64 + 32 - 1 = 95`. Counting inclusively gives `95 - 64 + 1 = 32`. That final `+1` matters: the difference between the two endpoints is not the number of addresses in the interval.

| Quantity                        | Result                  |
| ------------------------------- | ----------------------- |
| Supplied address                | `10.24.3.77/27`         |
| Network                         | `10.24.3.64/27`         |
| Complete range                  | `10.24.3.64–10.24.3.95` |
| Total addresses                 | 32                      |
| Conventional first host         | `10.24.3.65`            |
| Conventional last host          | `10.24.3.94`            |
| Conventional directed broadcast | `10.24.3.95`            |
| Conventional LAN capacity       | 30                      |

## Add an operational policy

For a conventional IPv4 LAN of this size, the network and directed-broadcast addresses are not assigned as ordinary host addresses. That leaves `32 - 2 = 30`. Subnet masking is described in [RFC 950](https://www.rfc-editor.org/rfc/rfc950.html); later specifications and operational contexts supply exceptions and additional restrictions.

Thirty available host addresses still does not necessarily mean thirty employee devices. A gateway, switch management interface, printer, virtual IP, or other infrastructure endpoint can consume an address. If a gateway uses `.65`, then 29 addresses remain for everything else. DHCP exclusions affect assignment policy without changing the mathematical subnet boundary.

A cloud network may reserve additional addresses. Select the appropriate provider profile and applicable service variant before using a capacity result in a purchasing or migration decision. Preserve that policy beside the calculation so another engineer can reproduce the answer.

## Handle small prefixes deliberately

A `/31` contains two addresses. On a point-to-point link using the behavior specified in [RFC 3021](https://www.rfc-editor.org/rfc/rfc3021.html), both are endpoints. Applying the ordinary subtraction of two would incorrectly claim that the link has no capacity. A `/32` identifies one address or host route; there is no pair of ordinary network/broadcast exclusions to remove.

A `/0` contains `2^32 = 4,294,967,296` addresses. That arithmetic describes the entire IPv4 space, including special-purpose ranges. It does not create a usable LAN of that size. At the other address-family boundary, IPv6 has no broadcast and must not inherit the IPv4 subtraction rule.

## Count subnets relative to a parent

The phrase “borrowed bits” needs a starting prefix. Splitting `10.24.3.0/24` into `/27` networks increases the prefix length by three. Therefore it creates `2^3 = 8` children, each with 32 addresses. Their starting octets are exactly the eight boundaries above.

Asking for three equal child blocks is different from asking to divide the entire parent into three equal CIDR subnets. A complete equal partition must contain a power-of-two number of children. You can allocate three equal `/26` blocks from a `/24`, but the fourth `/26` remains unused. A planner should display that unused block rather than imply that three blocks exhaust the parent.

## Keep classification separate from capacity

The example falls within the private `10.0.0.0/8` range described in [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918.html). “Private” tells you something about addressing scope; it does not determine the prefix supplied to an interface. A private address can be configured with many different valid subnet lengths.

Likewise, a remembered historical Class A boundary does not override an explicit `/27`. Class information can be useful when reading old course material, but modern calculations should use the given prefix. Special-use classification also needs the entire relevant range, because a large prefix can span several different purposes.

## Make your calculation reviewable

When documenting a subnet, record the original address and prefix, normalized network, complete endpoints, address count, selected policy, and infrastructure reservations. Check that the original address falls inside the computed range. If you split a parent, check both child containment and pairwise non-overlap.

In SubnetIQ, use the IPv4 calculator for the result and its deterministic explanation, then save or export the calculation with its policy. Try changing `/27` to `/28` before reading the new answer: 77 should now fall inside the 16-address block beginning at 64. The network stays the same in this example, while the final address and capacity change. That is a useful reminder that knowing the network address alone is not enough to identify a subnet.
