# 6. Plan VLSM from real requirements

## Requirements precede masks

Record each segment's purpose, endpoint count, gateways, growth, and policy. Decide whether “80 hosts” includes router interfaces. Apply a stated growth rule and round upward before choosing a subnet.

For a conventional IPv4 LAN, select the smallest h satisfying **2^h−2 ≥ required addresses**. The prefix is 32−h. A requirement of 80 needs /25: /26 supplies 62, while /25 supplies 126.

## Work a complete allocation

Use **192.168.10.0/24** with requirements already including gateways and no extra growth:

| Segment     | Required | Allocation        |    Capacity |
| ----------- | -------: | ----------------- | ----------: |
| Engineering |       80 | 192.168.10.0/25   |         126 |
| Operations  |       40 | 192.168.10.128/26 |          62 |
| Guest       |       20 | 192.168.10.192/27 |          30 |
| Router link |        2 | 192.168.10.224/31 | 2, RFC 3021 |

Place the largest aligned blocks first. Engineering occupies .0–.127, Operations .128–.191, Guest .192–.223, and the link .224–.225. The plan uses 128+64+32+2 = **226 total addresses**.

Thirty remain from .226 through .255. This is not one /27: the interval is too small and begins at the wrong boundary. Its exact cover is **.226/31, .228/30, .232/29, and .240/28**. Verify the total: 2+4+8+16 = 30.

## Preserve existing networks

Real plans contain locked allocations and reservations. First verify that every occupied block lies in the parent and that occupied intervals do not conflict. Then allocate around them without silently moving established networks.

Total free space alone does not guarantee a fit. Two separate /27 gaps may not hold one aligned /26. A useful planner names the failed requirement and explains whether the problem is capacity, alignment, or fragmentation.

## Define optimization

Largest-first allocation is reproducible and useful, but the objective matters. Minimum current consumption can conflict with future growth, site summarization, clear numbering, or minimal renumbering. Save assumptions with each revision so a reviewer understands why a larger prefix was selected.

Pair IPv4 and IPv6 segments by name, VLAN, and purpose, while respecting different capacity rules. Ordinary IPv6 LANs generally receive /64s rather than a tiny block chosen from today's endpoint count.

## Exercise and answer

A department needs 45 endpoints plus one gateway and 20% growth on that total. The target is ceil(46×1.2) = **56** addresses, so /26 fits with 62 conventional host positions. If the requirement later reaches 70, /25 is necessary.

Do not add the gateway twice when requirements already include it. Likewise, a provider reservation profile should not be layered blindly on conventional subtraction if its own documented count already includes those positions.

## Standards

- [RFC 4632: alignment and allocation](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 3021: /31 policy](https://www.rfc-editor.org/rfc/rfc3021)
