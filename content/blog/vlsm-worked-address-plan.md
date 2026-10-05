---
id: vlsm-worked-address-plan
title: A VLSM address plan you can audit from start to finish
description:
  Allocate a /24 across three departments and a router link, prove containment and capacity, and keep remaining
  space explicit.
category: Network planning
publishedAt: '2026-10-04'
readingMinutes: 8
---

## Turn requirements into a reproducible plan

An address plan is useful when another engineer can verify it without guessing what “hosts” or “free space” means. VLSM lets different segments receive different prefix lengths, but the planner must still respect alignment, the parent range, existing allocations, and the selected capacity policy.

This walkthrough uses the private parent `192.168.10.0/24`. The requested endpoint counts are 80 for Engineering, 40 for Operations, 20 for Guest, and two for a router link. Assume the departmental counts already include their gateway and infrastructure addresses. There are no reservations or growth allowances in the first pass. The departments use conventional IPv4 LAN capacity; the link uses RFC 3021 point-to-point behavior.

## Convert requirements into block sizes

A conventional LAN block must satisfy `2^hostBits - 2 >= requiredEndpoints`. Choose the smallest block that meets the requirement; then its prefix is `32 - hostBits`.

Engineering needs 80 endpoints. A `/26` has 64 addresses and conventional capacity 62, which is insufficient. A `/25` has 128 addresses and capacity 126, so Engineering receives a `/25`.

Operations needs 40. A `/27` has capacity 30 and is too small; a `/26` has capacity 62. Guest needs 20, which fits a `/27` with capacity 30. The two-endpoint link receives a `/31` under the explicitly selected policy from [RFC 3021](https://www.rfc-editor.org/rfc/rfc3021.html).

| Segment     | Requirement | Prefix | Block addresses | Usable capacity |
| ----------- | ----------: | ------ | --------------: | --------------: |
| Engineering |          80 | `/25`  |             128 |             126 |
| Operations  |          40 | `/26`  |              64 |              62 |
| Guest       |          20 | `/27`  |              32 |              30 |
| Router link |           2 | `/31`  |               2 |               2 |

These are sizes, not placements. Placement adds the alignment constraint. A `/25` in this parent starts at final octet 0 or 128; a `/26` starts at 0, 64, 128, or 192. A sufficiently large gap is not usable for a requested CIDR block unless an aligned block fits inside it.

## Place the blocks in descending size

Begin with Engineering at `192.168.10.0/25`. It occupies `.0` through `.127`. Operations can start at the next appropriate `/26` boundary, `.128`, and occupies `.128` through `.191`. Guest then starts at `.192` and ends at `.223`. The router link starts at the even boundary `.224` and uses `.224` and `.225`.

| Segment     | Allocation          | Complete range | Assignable endpoints |
| ----------- | ------------------- | -------------- | -------------------- |
| Engineering | `192.168.10.0/25`   | `.0–.127`      | `.1–.126`            |
| Operations  | `192.168.10.128/26` | `.128–.191`    | `.129–.190`          |
| Guest       | `192.168.10.192/27` | `.192–.223`    | `.193–.222`          |
| Router link | `192.168.10.224/31` | `.224–.225`    | `.224–.225`          |

The final column assumes the policies stated at the beginning. It does not choose gateway addresses, configure DHCP, or apply firewall rules. Those operational settings should be added explicitly to the project.

Descending-size allocation is a practical deterministic strategy for this unconstrained example. It should not be described as a universal proof of optimal packing when locked networks, exclusions, growth preferences, and routing boundaries enter the problem.

## Account for every remaining address

The allocations consume `128 + 64 + 32 + 2 = 226` addresses from a parent containing 256. The remainder is 30 addresses, beginning at `.226` and ending at `.255`.

That remainder is contiguous as an interval, but it is not one CIDR block. Its minimal exact representation is:

```text
192.168.10.226/31
192.168.10.228/30
192.168.10.232/29
192.168.10.240/28
```

Their sizes are `2 + 4 + 8 + 16 = 30`. Returning `192.168.10.224/27` as “free” would be wrong because it includes the active router link. More generally, a single covering summary can include extra space; exact aggregation must preserve the original address set. The distinction follows from the prefix hierarchy described in [RFC 4632](https://www.rfc-editor.org/rfc/rfc4632.html).

## Name the utilization measure

“88 percent utilized” is incomplete unless it says what is being counted. Allocated address-space occupancy is `226 / 256`, approximately 88.28 percent. Required endpoints total `80 + 40 + 20 + 2 = 142`. The selected blocks offer total endpoint capacity `126 + 62 + 30 + 2 = 220`, so requirements consume approximately 64.55 percent of that capacity.

Both numbers are correct. They answer different questions. Neither measures observed devices online. A project should distinguish reserved space, allocated space, requested endpoint capacity, and any future monitoring data.

## Add growth before you finalize

Suppose the departments need 25 percent growth. Their adjusted requirements become 100, 50, and 25 endpoints. All three still fit their original blocks. This makes the plan more robust without changing its placement.

Now increase Engineering's requirement to 128 endpoints. A `/25` cannot satisfy it because conventional capacity is 126. Engineering alone would need a `/24`, leaving no room for the other segments within the current parent. The right response is an explicit capacity failure or a revised requirement, not silently treating total addresses as usable hosts.

If counts exclude a gateway, add it before rounding to a block size. One additional endpoint can matter dramatically near a boundary. A requirement of 30 fits `/27`; a requirement of 31 requires `/26` under the same LAN policy.

## Preserve existing networks

Real projects often begin with occupied space. If Operations already owns `192.168.10.0/26`, lock it before allocating the other segments. Engineering can no longer start at `.0/25`; it could use `.128/25` instead. Guest could fit at `.64/27`, with an appropriately aligned link elsewhere in the remaining gap.

That rearrangement illustrates why a changed allocation should produce a revision comparison. A mathematically valid new plan may require operational renumbering. The project should make moved and resized segments visible before anyone applies it.

## Review the completed plan

Verify each block's alignment, containment, and capacity, then check all pairs for overlap. Confirm that reserved ranges are excluded and that each allocation retains its name, policy, and purpose. Keep intentionally reused private ranges in distinct routing or site contexts; private addressing is described in [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918.html).

Use SubnetIQ's VLSM planner to reproduce this example, inspect the address-space map, and export the result. Save a checkpoint before changing requirements. A good review can then answer exactly what changed, why it changed, and which addresses remain available.
