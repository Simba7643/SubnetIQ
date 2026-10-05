# 3. Historical classes and modern classification

## Why classes existed

Early IPv4 used leading-bit patterns to select fixed network sizes. Class A, B, and C made allocations simple to describe, but organization needs rarely matched those few sizes neatly. CIDR introduced explicit prefixes and more flexible allocation.

| Class | Leading bits | First octet pattern | Historical default |
| ----- | ------------ | ------------------- | ------------------ |
| A     | 0            | 0–127               | /8                 |
| B     | 10           | 128–191             | /16                |
| C     | 110          | 192–223             | /24                |
| D     | 1110         | 224–239             | Multicast          |
| E     | 1111         | 240–255             | Reserved/special   |

A pattern does not erase special allocations. The 127/8 block is loopback and 0/8 has special semantics. Class D and E do not supply ordinary unicast LAN host masks. Treat this table as history, not a current allocation guide.

## Explicit prefixes determine mathematics

For **172.20.9.40/24**, the historical label is Class B, but the supplied /24 is authoritative. The network is **172.20.9.0/24**, not 172.20.0.0/16. Silently replacing /24 with a class default changes the local range and can break gateway selection.

Classes remain useful vocabulary in historical explanations and some certification questions. Modern calculations should always use an explicit prefix or clearly ask for one.

## Private space cuts across historical sizes

RFC 1918 reserves **10.0.0.0/8**, **172.16.0.0/12**, and **192.168.0.0/16**. The middle block includes sixteen /16 networks, while the last includes 256 /24 networks. Calling each allocation one private Class B or Class C network hides its actual size.

Other purposes include loopback, link-local, shared provider space, multicast, benchmarking, and documentation. An address outside RFC 1918 can still be unavailable for ordinary global use. Address purpose and class must therefore be presented separately.

## Work through an example

For **172.31.250.6/27**, first identify the historical Class B label. Then determine RFC 1918 membership: the second octet lies between 16 and 31, so it is private. Finally apply /27: the last-octet increment is 32. The network is **172.31.250.0/27**, broadcast .31, with conventional hosts .1–.30.

Changing the address to **172.32.250.6/27** preserves the class and subnet arithmetic but removes RFC 1918 membership. It does not prove that your organization owns that address or can reach it globally.

## Check yourself

1. Does Class B force /16? No; explicit classless prefixes govern the calculation.
2. Is all 172/8 private? No; only 172.16/12 is RFC 1918.
3. Should a multicast Class D address be treated as a normal subnet with two reserved hosts? No; purpose and delivery semantics differ.

## Standards

- [RFC 4632: classless allocation](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 1918: private allocations](https://www.rfc-editor.org/rfc/rfc1918)
- [IANA special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/)
