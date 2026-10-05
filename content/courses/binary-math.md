# 2. Binary and the subnet boundary

## Eight bit weights

An IPv4 octet has weights **128, 64, 32, 16, 8, 4, 2, 1**. A one includes its weight and a zero contributes nothing. Decimal 77 is 64 + 8 + 4 + 1, so its eight-bit form is **01001101**. Leading zeros preserve positions when comparing masks.

For decimal-to-binary conversion, inspect weights from largest to smallest. For 77, 128 does not fit; 64 does, leaving 13. Neither 32 nor 16 fits; 8 leaves 5, then 4 and 1 complete the value. Binary-to-decimal conversion simply sums the selected weights.

## The mask preserves network bits

A contiguous IPv4 mask contains leading ones and trailing zeros. The ones preserve network positions and the zeros clear host positions. For **/26**, the last mask octet is **11000000**, giving **255.255.255.192**.

For **192.0.2.77/26**:

| Value   | Final octet bits | Decimal |
| ------- | ---------------- | ------: |
| Address | 01001101         |      77 |
| Mask    | 11000000         |     192 |
| AND     | 01000000         |      64 |

AND yields one only where both operands have one. The network is **192.0.2.64/26**. Six positions remain variable, providing 2^6 = **64 addresses**. Setting all host positions to one gives **01111111**, decimal 127, so the broadcast is 192.0.2.127.

## Count combinations before capacity

One variable bit gives two patterns; every additional bit doubles the count. Five host bits produce 32 addresses, six produce 64, and seven produce 128. Conventional IPv4 LANs then exclude network and broadcast. Point-to-point /31 and host-route /32 require their explicit rules.

Subnet counts use the same reasoning. Extending /24 to /27 introduces three subnet bits, giving eight children. Always identify the parent first: borrowed bits are relative to it, not to an assumed historical address class.

## Hexadecimal is a compact view

One hexadecimal digit represents four bits. **C0** becomes **1100 0000**, or decimal 192. IPv6 uses hexadecimal to make 128-bit addresses readable, but its boundaries still follow bit positions. Extending /60 to /64 adds four bits, equivalent to one hexadecimal digit, and creates sixteen child networks.

## Exercise and answer

Convert **214**: 128 + 64 + 16 + 4 + 2 gives **11010110**. AND with **11100000** (224) gives **11000000** (192). Thus 192.0.2.214/27 belongs to **192.0.2.192/27**, containing .192–.223 and conventional hosts .193–.222.

Use the octet toggler to reproduce 214. Flipping the 32-weight bit moves the address into another /27; flipping the 2-weight bit changes only its host position. The visible boundary explains the difference.

## Standards

- [RFC 4632: prefix notation](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 791: IPv4](https://www.rfc-editor.org/rfc/rfc791)
