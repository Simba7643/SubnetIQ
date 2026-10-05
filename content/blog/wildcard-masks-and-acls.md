---
id: wildcard-masks-and-acls
title: 'Wildcard masks and ACLs: prove what a rule matches'
description: Convert CIDR masks, analyze a noncontiguous wildcard, and review rule order with concrete packet examples.
category: Network security
publishedAt: '2026-10-04'
readingMinutes: 8
---

## Define the matching set

A wildcard mask is a pattern-matching instruction. It tells an ACL which address bits matter and which can vary. Understanding that bit test helps you review a rule before it is applied to a router or firewall.

This article uses Cisco-style IPv4 ACL notation for teaching. The examples are rule fragments for a reviewed lab configuration. They do not specify an interface, direction, management path, or complete policy for a live device. Other firewall platforms may use different objects, ordering, state handling, and syntax.

## Read zero as compare and one as ignore

For a Cisco wildcard, a zero bit means the corresponding address bit must match. A one bit means that bit is ignored. Cisco explains this behavior in its [IP access list configuration reference](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html).

For a contiguous CIDR prefix, the wildcard is the bitwise inverse of the subnet mask. A `/27` mask is `255.255.255.224`, so its wildcard is `0.0.0.31`. You can calculate each octet as `255 - maskOctet`, or invert the bits directly.

The pattern `10.20.30.0 0.0.0.31` fixes the first 27 bits. It matches the entire range `10.20.30.0` through `10.20.30.31`. The ACL match includes the numerical endpoints; the rule does not automatically remove addresses because they would normally serve as network or broadcast addresses on a LAN.

That distinction is useful when testing. A subnet calculator's usable-host display and an ACL's matching set serve different purposes. Treating them as identical can hide an overly broad pattern.

## Evaluate a candidate address

The comparison can be written as:

`candidate AND NOT wildcard = configuredAddress AND NOT wildcard`

Apply the operation across exactly 32 bits. For our `/27` pattern, the final wildcard octet is binary `00011111`, making the comparison mask `11100000`.

Candidate `.18` is binary `00010010`. Masking it gives `00000000`, which matches the masked configured octet `.0`. Candidate `.40` is binary `00101000`; masking it gives `00100000`, which does not match.

| Candidate     | Inside the pattern? | Why                                     |
| ------------- | ------------------- | --------------------------------------- |
| `10.20.30.0`  | Yes                 | All compared bits match                 |
| `10.20.30.18` | Yes                 | Differences are limited to ignored bits |
| `10.20.30.31` | Yes                 | All five host bits may vary             |
| `10.20.30.32` | No                  | A compared prefix bit changes           |
| `10.20.31.18` | No                  | The third octet must match exactly      |

To match one address, use wildcard `0.0.0.0`, often expressed with the `host` keyword. To match any IPv4 address, the wildcard is `255.255.255.255`, often expressed as `any`.

## Do not assume every wildcard is one CIDR

A wildcard can ignore bits that are not consecutive. Consider `10.20.0.0 0.0.5.255`. Decimal 5 is binary `00000101`. In the third octet, only the bits worth 1 and 4 may vary. The possible third-octet values are therefore 0, 1, 4, and 5.

The matched set is exactly:

```text
10.20.0.0/24
10.20.1.0/24
10.20.4.0/24
10.20.5.0/24
```

This totals 1,024 addresses. It can be aggregated exactly into `10.20.0.0/23` and `10.20.4.0/23`, but not into one prefix without adding other addresses. A single covering `10.20.0.0/21` would also include third octets 2, 3, 6, and 7, adding another 1,024 addresses.

The inverted mask here is `255.255.250.0`. Because its one bits are not a single contiguous prefix, it is not a valid ordinary CIDR subnet mask. Cisco's [ACL overview](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-3s/sec-data-acl-xe-3s-book/sec-access-list-ov.html) describes the wildcard bit comparison independently of CIDR notation.

## Combine address matching with protocol intent

An extended ACL can describe source, destination, protocol, and ports. For example, this fragment permits the source `/27` to a documentation server address on TCP destination port 443:

```text
permit tcp 10.20.30.0 0.0.0.31 host 192.0.2.20 eq 443
```

The rule expresses a packet match. It does not configure a TLS certificate or prove that the destination application is HTTPS. It also does not, by itself, establish a complete stateful security policy. The `192.0.2.0/24` block is reserved for documentation by [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737.html).

Be equally precise about which port is constrained. A client typically uses an ephemeral source port when connecting to destination 443. Accidentally filtering the source port instead changes the permitted set of packets. Reviewing the rendered rule beside a plain-language statement helps catch this mistake.

## Review order before applying a rule

Suppose one client, `10.20.30.18`, should be excluded from that server. These fragments express the narrow exclusion first:

```text
deny tcp host 10.20.30.18 host 192.0.2.20 eq 443
permit tcp 10.20.30.0 0.0.0.31 host 192.0.2.20 eq 443
```

For a first-match ACL, the narrow deny must appear before the broader permit. Reversing the order means the broad rule already matches the excluded client. Cisco's [ACL creation and application guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/15-s/sec-data-acl-15-s-book/sec-create-ip-apply.html) also explains the implicit deny for traffic not explicitly permitted.

That final deny deserves explicit review. A fragment that permits one application can block DNS, routing protocols, monitoring, or administrative access when incorporated into a complete ACL. The required permit rules depend on the interface and traffic direction. Evaluate that complete context rather than attaching a sample fragment blindly.

## Build a small test matrix

Write expected results for an allowed source, a denied source, an address immediately outside the subnet, the intended destination, another destination, the allowed port, and another port. For each packet, identify the first matching rule or the final implicit denial.

Use SubnetIQ's wildcard helper to inspect the mask and the firewall worksheet to prepare rule text. Keep the plain-language policy and packet examples with the exported artifact. Apply any real configuration through your normal review and rollback process, then check the resulting behavior. A concise test matrix is often more informative than reading a long ACL several times without concrete packets in mind.
