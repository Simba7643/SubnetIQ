# 5. Split a network and verify every boundary

## Begin with the parent

Subnetting divides an allocation into smaller aligned networks. Borrowed bits require a stated parent: /24 to /27 adds three bits, while /16 to /27 adds eleven. A complete equal partition contains **2^(child prefix−parent prefix)** children.

To split /24 into eight equal networks, add three bits and use /27. Three equal CIDR children cannot exactly fill a parent because three is not a power of two. Three /26 allocations inside /24 are valid, but another /26 remains unused.

## Complete worked split

Divide **192.0.2.0/24** into four parts. Four is 2^2, so the child prefix is /26. The mask is 255.255.255.192, producing a final-octet increment of 256−192 = 64.

| Network        | Complete range | Conventional hosts |
| -------------- | -------------- | ------------------ |
| 192.0.2.0/26   | .0–.63         | .1–.62             |
| 192.0.2.64/26  | .64–.127       | .65–.126           |
| 192.0.2.128/26 | .128–.191      | .129–.190          |
| 192.0.2.192/26 | .192–.255      | .193–.254          |

Each block has 64 addresses, and four times 64 equals the parent's 256. Every child begins immediately after the previous complete endpoint. This independently checks that there are no gaps, overlaps, or addresses outside the parent.

## Use the magic number in the correct octet

For **/19**, the mask is 255.255.224.0 and the increment is 32 in the third octet. **10.3.70.9** lies in third octets 64–95. Its network is **10.3.64.0/19**, ending at **10.3.95.255**. Applying a 32-address increment only to the last octet would be wrong.

Binary AND is the general rule, and the shortcut should agree with it. An explanation showing both methods lets you verify your own reasoning.

## Special prefixes need explicit policies

A /30 contains four addresses and conventionally supports two hosts. A /31 contains two addresses and permits both as endpoints on an RFC 3021 point-to-point link. A /32 represents one address or host route. Applying “subtract two” to every prefix gives false results.

IPv6 uses 128-bit counts and no broadcast subtraction. Mathematical size and practical deployment policy remain separate outputs.

## Exercise and answer

Split **198.51.100.0/24** into eight equal networks. The answer is /27, starting at .0, .32, .64, .96, .128, .160, .192, and .224. The fifth child is **198.51.100.128/27**, full range .128–.159, conventional hosts .129–.158.

Use the visualizer to select each block. For a very large result, inspect the declared total and navigation controls so a bounded preview is not mistaken for the whole address space.

## Standards

- [RFC 4632: prefix allocation](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 3021: two-endpoint links](https://www.rfc-editor.org/rfc/rfc3021)
