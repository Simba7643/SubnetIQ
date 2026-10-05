---
id: ipv6-prefix-planning
title: IPv6 /64 planning, with the exceptions kept visible
description: Design a readable /48 to /56 to /64 hierarchy, calculate its capacity, and understand /127 links and /128 routes.
category: IPv6 planning
publishedAt: '2026-10-04'
readingMinutes: 8
---

## Plan subnets before interface addresses

IPv6 planning becomes easier when the unit of planning is a subnet. A large address count does not remove the need for structure: sites, routing boundaries, VLANs, reservations, and operational ownership still need a clear relationship.

This example uses `2001:db8:4200::/48`, drawn from the documentation prefix reserved by [RFC 3849](https://www.rfc-editor.org/rfc/rfc3849.html). It is an example allocation, not space to deploy on the public Internet. We will divide it into sites and LANs, then distinguish ordinary LAN planning from point-to-point and host-route cases.

## Count child prefixes exactly

The number of equal child networks is `2^(childPrefix - parentPrefix)`. Dividing a `/48` into `/64` networks produces `2^16 = 65,536` children. Each `/64` contains `2^64 = 18,446,744,073,709,551,616` address combinations.

These are separate quantities. The first tells you how many `/64` subnets fit in the allocation. The second tells you how many addresses belong to one such subnet. A calculator should display both with exact integer arithmetic, rather than rounding a large floating-point number into scientific notation and losing the final digits.

IPv6 has no broadcast address. Do not subtract two from its address count using an IPv4 habit. The addressing architecture and address types are defined in [RFC 4291](https://www.rfc-editor.org/rfc/rfc4291.html). An address count still does not promise that every possible address has the same operational role.

## Create a hierarchy that people can read

Choose a `/56` allocation per site. The difference from `/48` to `/56` is eight bits, so the parent can contain 256 such site allocations. Each `/56` has eight remaining subnet bits before `/64`, providing 256 `/64` networks per site.

The fourth hexadecimal group becomes a convenient label. Its high two hex digits identify the site in this example, and its low two digits identify a subnet within that site.

| Purpose          | Prefix                   | Meaning in this plan               |
| ---------------- | ------------------------ | ---------------------------------- |
| Organization     | `2001:db8:4200::/48`     | Entire example allocation          |
| Site 1           | `2001:db8:4200:100::/56` | Fourth group `0100` through `01ff` |
| Site 1 staff LAN | `2001:db8:4200:101::/64` | Subnet `01` within site `01`       |
| Site 1 guest LAN | `2001:db8:4200:102::/64` | Subnet `02` within site `01`       |
| Site 2           | `2001:db8:4200:200::/56` | Fourth group `0200` through `02ff` |

The compressed spelling `:100:` is the same value as `:0100:`. Leading zeros are omitted in canonical output; their absence does not move the site boundary. [RFC 5952](https://www.rfc-editor.org/rfc/rfc5952.html) specifies a consistent textual representation, including zero compression rules.

This allocation scheme is an example, not a requirement to encode every organizational attribute in an address. An organization that gives some sites larger blocks can use a different hierarchy. The important property is that the prefix boundaries and allocation reasons remain explicit.

## Leave growth at useful boundaries

A `/56` can also be divided into sixteen `/60` blocks. Each `/60` contains sixteen `/64` networks. You might reserve one `/60` for a future building and leave the remaining blocks for current operations.

Contiguous, aligned reservations are easier to recognize than scattered spare VLANs. However, labels such as “building” or “security zone” should be accompanied by actual routing and access policy. An address hierarchy alone does not enforce isolation.

When pairing IPv4 and IPv6, give a segment one shared name and purpose. Its IPv4 and IPv6 allocations need not have numerically matching identifiers. A paired project record can show that `Staff VLAN 10` uses a particular IPv4 `/25` and IPv6 `/64` while keeping both plans individually valid.

## Understand why /64 is the ordinary LAN choice

The 64-bit interface-identifier boundary is embedded in important IPv6 mechanisms and assumptions. [RFC 7421](https://www.rfc-editor.org/rfc/rfc7421.html) analyzes that boundary and the effects of changing it. [RFC 4862](https://www.rfc-editor.org/rfc/rfc4862.html) describes stateless address autoconfiguration, including the relationship between an advertised prefix and the interface identifier length.

For normal Ethernet LAN planning with SLAAC, start from `/64`. A proposal to shrink the prefix merely because the LAN currently has ten hosts should account for the mechanisms and equipment involved. The large number of addresses is not comparable to wasting scarce IPv4 host slots.

Also avoid turning `/64` into an absolute rule for every route and link. Routes may summarize several subnets, a host route may identify one address, and inter-router point-to-point links have a specific exception.

## Keep /127 and /128 cases explicit

[RFC 6164](https://www.rfc-editor.org/rfc/rfc6164.html) specifies the use of `/127` prefixes on inter-router point-to-point links. Such a prefix contains two addresses. For example, `2001:db8:4200:ff00::10/127` contains addresses ending in `::10` and `::11`.

That example should be labeled as an inter-router link. It is not an instruction to advertise a `/127` as an ordinary autoconfiguring user LAN. Check that both devices support the intended link configuration and that the wider address plan reserves the infrastructure space appropriately.

A `/128` describes one address, as in `2001:db8:4200:ffff::1/128`. It can identify a loopback or other host route. Whether the corresponding address is reachable depends on actual routing and interface configuration, not its appearance in a calculator.

## Separate containment from conflict

The organization `/48` contains each site `/56`, and the site `/56` contains its LAN `/64` networks. That hierarchy is intentional. Two independently assigned sibling LANs should not overlap, while a parent allocation and its children necessarily do.

A useful overlap review therefore asks what each record represents. Mark parents as allocation containers and leaves as assigned networks. Otherwise a simple overlap detector can correctly identify mathematical intersections while presenting a confusing operational conclusion.

For very large plans, inspect counts and selected index ranges instead of trying to render every address. A `/64` is not a practical list of eighteen quintillion rows. SubnetIQ's IPv6 planner provides bounded child previews and exact counts so the interface can stay responsive while keeping the scope visible.

## Document decisions alongside prefixes

Record the delegated parent, site ownership, subnet purpose, reserved growth blocks, interface addressing method, and paired IPv4 segment when applicable. Use canonical address text in exports, but keep human names beside it. Finally, test containment and non-overlap on the actual exported plan. Those checks are inexpensive compared with renumbering a site after inconsistent spreadsheets reach production.
