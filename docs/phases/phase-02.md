# Phase 02 — Network calculation engine

## Delivered

`packages/netcalc` is a synchronous, browser-compatible TypeScript package with no filesystem, network, framework, or database dependency. Its public entry point is `calculate(toolId, input)`. It validates inputs, returns the shared `CalculationResult` contract, and throws a helpful `Error` for an invalid or infeasible request.

All 20 registered mathematical tools are implemented. Every result has normalized inputs that can be recalculated, summary values, deterministic explanations, warnings where assumptions matter, and a version identifier. Address counts use `BigInt` internally and decimal strings at JSON boundaries. No result contains a nonserializable `BigInt`.

| Tool ID         | Implemented behavior                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ipv4-subnet`   | CIDR normalization, mask/wildcard, full and usable ranges, explicit LAN/point-to-point/cloud policies, historical class, registry classification, binary AND, hexadecimal, previous/next subnet, and optional parent-relative borrowed bits |
| `ipv4-split`    | Complete equal splits or explicit arbitrary-count allocation, exact free-space cover, and bounded indexed previews                                                                                                                          |
| `vlsm`          | Named host requirements, exact rounded growth, per-segment policies, locked CIDRs, reservations, deterministic aligned placement, capacity/utilization, and remaining CIDRs                                                                 |
| `aggregate`     | Minimal exact union or a distinct single covering prefix, with every added range and address count identified                                                                                                                               |
| `range-to-cidr` | Minimal exact CIDR cover of any inclusive IPv4 or IPv6 range                                                                                                                                                                                |
| `cidr-to-range` | Canonical inclusive range and exact size for both address families                                                                                                                                                                          |
| `overlap`       | Duplicate and containment pairs, stable input indices, separate family checks, and bounded output with exact conflict totals                                                                                                                |
| `wildcard`      | Contiguous and noncontiguous masks, match counts, exact CIDR decomposition, and a reviewable Cisco standard ACL statement                                                                                                                   |
| `convert`       | Exact binary, octal, decimal, and hexadecimal integer conversion, including dotted IPv4 octets and large signed integers                                                                                                                    |
| `classify`      | Longest-prefix IANA matching, separate reachability flags, complete range partitioning, mixed-purpose detection, and IPv6 multicast scope                                                                                                   |
| `reverse-dns`   | IPv4/IPv6 host reverse names, octet/nibble delegation boundaries, and RFC 2317 child-zone/CNAME examples                                                                                                                                    |
| `netmask-table` | Every `/0`–`/32` row with exact counts, mask/wildcard, selected capacity policy, and policy support status                                                                                                                                  |
| `ipv6-subnet`   | `/0`–`/128` exact ranges/counts, prefix masks, classification, conventional LAN guidance, and `/127`/`/128` explanations                                                                                                                    |
| `ipv6-format`   | Expansion, RFC 5952 canonical output, mapped dotted-tail formatting, hexadecimal/decimal/binary views, and per-group breakdown                                                                                                              |
| `eui64`         | MAC conversion with inserted `ff:fe`, toggled universal/local bit, `/64` combination, and privacy context                                                                                                                                   |
| `ipv6-plan`     | Exact hierarchical child counts, arbitrary decimal start indices, bounded previews, explicit reservations, and separate physical/child unavailability counts                                                                                |
| `ipv4-map`      | Mapped-address, all six RFC 6052 NAT64 layouts, and historical 6to4 encoding/decoding                                                                                                                                                       |
| `bandwidth`     | SI/IEC size units, decimal bit rates, percentage efficiency, transfer time, and exact rational duration data                                                                                                                                |
| `mtu`           | Outer path MTU, tunnel overhead, fixed IP/TCP headers, IPv4 options, IPv6 extension headers, RFC 6691 base MSS, and actual TCP payload                                                                                                      |
| `mac`           | Strict 48-bit format conversion, individual/group and universal/local bit analysis, broadcast detection, and OUI-style prefix extraction                                                                                                    |

## Numerical and operational semantics

IPv4 input requires exactly four decimal octets without leading zeroes. IPv6 accepts one valid `::` compression and an optional embedded dotted IPv4 tail, validates all groups, and rejects interface zone identifiers in mathematical input. Prefixes are validated before shifts or masks are constructed. Parsing and formatting cover both unsigned address spaces without signed 32-bit truncation.

`0.0.0.0/0` contains 4,294,967,296 addresses. Under conventional LAN arithmetic, `/31` has zero conventional LAN hosts and explicitly directs the user to the RFC 3021 policy. That policy exposes both endpoints and no directed broadcast. A `/32` is one host route. These choices follow [RFC 3021](https://www.rfc-editor.org/rfc/rfc3021.html) and keep mathematical range size separate from operational capacity.

IPv6 never applies the IPv4 minus-two rule. `::/0` contains exactly 340,282,366,920,938,463,463,374,607,431,768,211,456 addresses. A `/48` has 65,536 `/64` child positions. `/127` receives inter-router point-to-point guidance from [RFC 6164](https://www.rfc-editor.org/rfc/rfc6164.html); `/128` is one address. Canonical compression follows [RFC 5952](https://www.rfc-editor.org/rfc/rfc5952.html), including the leftmost-longest zero-run rule and retaining isolated zero groups.

The VLSM allocator places locked allocations and merges explicit reservations first. It grows host requirements with exact integer rounding, chooses the smallest supported policy block, orders remaining segments by descending size, and uses the first aligned free interval. Input order breaks ties. The result reconciles allocation, reservation, and free-space totals. Fragmentation produces an actionable infeasibility error; locks are never silently moved. The planner does not claim a proof of global network-design optimality.

IPv6 reservations preserve stable child indices. A partially reserved child is unavailable as a complete allocation even though only some of its addresses are physically reserved. Results expose both counts. The compact `freeChildRanges` data describes available index intervals without enumerating a theoretical address space.

Exact aggregation preserves the original address union. Cover mode may include gaps and explicitly reports each extra inclusive range. Noncontiguous wildcards are represented as a match expression and a bounded preview of their exact minimal CIDRs; they are never labeled as one ordinary subnet.

NAT64 supports `/32`, `/40`, `/48`, `/56`, `/64`, and `/96`, checks the reserved `u` octet, and supports both conversion directions. A nonzero suffix is identified while decoding its IPv4 value as described by [RFC 6052](https://www.rfc-editor.org/rfc/rfc6052.html). Encoding a non-global IPv4 address with the well-known prefix is labeled as a mathematical example and operationally ineligible. 6to4 output is historical material with [RFC 7526](https://www.rfc-editor.org/rfc/rfc7526.html) context.

The MTU calculator separates the base MSS ceiling from actual TCP data after options and extension headers. This distinction follows [RFC 6691](https://www.rfc-editor.org/rfc/rfc6691.html). Encapsulation is subtracted from an explicitly supplied outer IP path MTU; Ethernet framing is not subtracted a second time.

## Versioned reference data

`data/special-ipv4.json` and `data/special-ipv6.json` contain the IANA special-purpose registry snapshot dated 2025-10-09, reviewed on 2026-10-04. Architectural multicast and global-unicast entries are separately marked as supplements. The browser runtime uses equivalent generated TypeScript data, and a test enforces exact agreement with the JSON snapshots.

Registry entries preserve source validity, destination validity, forwardability, global reachability, protocol reservation, reference, provenance, and caveats. More-specific registrations override broader entries. Complete CIDR ranges are partitioned at entry boundaries to detect mixed classifications. Unlisted address space is explicitly described as a classification fallback; a registry flag does not prove assignment, routing, or reachability.

Primary sources:

- [IANA IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)
- [IANA IPv6 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml)
- [AWS VPC subnet CIDR sizing](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)
- [Azure Virtual Network FAQ](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq)
- [Google Cloud subnet address reservations](https://docs.cloud.google.com/vpc/docs/subnets)

`data/cloud-profiles.json` contains reviewed IPv4 reservation and prefix-limit profiles. AWS and Azure standard IPv4 subnets reserve five addresses; Google Cloud primary ranges reserve four. Explicit `cloudVariant` values model the AWS `byoip` and Google Cloud `secondary` exceptions. Service-specific restrictions, permissible ranges, account quotas, and routing constraints remain separate checks. Subnet results identify whether the selected prefix is supported and include the cloud profile review version.

## Public integration API

```typescript
import { calculate, parseNetwork, formatIPv4, prefixMask } from '@subnetiq/netcalc';

const result = calculate('ipv4-subnet', {
  address: '192.168.10.77/26',
  parent: '192.168.0.0/16',
  policy: 'lan',
});

const network = parseNetwork('192.168.10.77/26');
const mask = formatIPv4(prefixMask(network.prefix, 32));
const restored = calculate(result.toolId, result.normalizedInput);
```

Additional stable exports include `parseIPv4`, `parseIPv6`, `formatIPv6`, `parseIP`, `networkFrom`, `contains`, `rangeToNetworks`, `mergeIntervals`, `subtractIntervals`, `aggregateNetworks`, `classifyAddress`, `classifyNetwork`, `capacity`, `smallestPrefix`, `parseMAC`, `encodeNAT64`, and `decodeNAT64`.

Every result uses the shared `CalculationResult` contract. Allocation outputs expose `blocks`. Previewed tools expose `previewCount`, `previewLimit`, and `truncated` in `data`, plus exact theoretical counts. The preview limit is 256 rows. IPv4 split counts may reach 2^32; IPv6 starting indices use decimal strings. Network lists are capped at 1,000 inputs; VLSM segments and reservation lists are capped at 256. These bounds control materialization without rounding address counts.

## Verification

The completed phase was verified with:

```bash
pnpm --filter @subnetiq/shared build
pnpm --filter @subnetiq/netcalc build
pnpm exec vitest run packages/netcalc/tests
pnpm exec eslint packages/netcalc/src packages/netcalc/tests
```

The mathematical test suite passes **677 tests in three files**, including 320 independently generated Python `ipaddress` network fixtures and 160 independent range-cover fixtures. The fixture generator was Python 3.12.14 with deterministic seed 20261004. The fixtures are checked into `packages/netcalc/tests/fixtures/python-ipaddress.json` so subsequent tests do not require Python.

Generated property tests cover 32-bit and 128-bit round trips, network alignment and conservation, minimal exact range covers, split/reassembly, random feasible VLSM allocation, wildcard equivalence, and every supported NAT64 layout. Fixed regressions cover ambiguous leading zeroes, `/0`, `/31`, `/32`, `/127`, `/128`, embedded IPv4, mixed families, IANA exception precedence, duplicate overlaps, cloud exceptions, locked-plan fragmentation, growth rounding, IPv6 reservations, huge bounded previews, reverse-delegation boundaries, and MSS option semantics.

All 20 calculation results have been checked for JSON serialization, deterministic output, and reusable normalized inputs. TypeScript compilation and the package ESLint check pass. No live network, cloud account, or DNS authority is required by this package; provider and database integration validation belong to their corresponding phases.
