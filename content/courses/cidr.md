# 4. CIDR, masks, and complete ranges

## Read the slash as a bit count

An IPv4 **/p** fixes p of 32 bits and leaves 32−p variable. Its complete address count is **2^(32−p)**. IPv6 follows the same rule with 128 bits. A longer prefix means a smaller block: /24 contains 256 addresses, /25 128, /26 64, and /27 32.

Avoid saying only “increase the subnet.” State whether you mean a longer prefix or a larger capacity, because those move in opposite directions.

## Convert the mask

A /27 contains 27 leading one bits and five zeros. The first three octets equal 255; the last equals 128 + 64 + 32 = 224. Thus its mask is **255.255.255.224** and its inverse wildcard is **0.0.0.31**.

For /20, the first two octets are 255, the third has four leading ones (240), and the last is zero. Its mask is **255.255.240.0**, with 2^12 = **4,096 total addresses**. Not every boundary sits in the last octet.

## Check alignment

A network identifier has all host bits zero. **192.0.2.64/26** is aligned because /26 boundaries occur at final-octet values 0, 64, 128, and 192. The interface input **192.0.2.96/26** belongs to the network beginning at .64; it does not create a new block beginning at .96.

Normalization should be visible in a calculator. Otherwise a user could incorrectly assume an allocation starts at the typed host address and runs forward for the block size.

## Keep three quantities separate

First, total address count follows pure mathematics. Second, conventional IPv4 LAN capacity excludes network and broadcast through /30. Third, operational reservations account for gateways, virtual addresses, provider rules, and growth.

A /26 has 64 total addresses and 62 conventional host positions. Reserving one gateway leaves 61 for other endpoints. If a stated requirement already includes that gateway, avoid adding it again. A point-to-point /31 can use both addresses under RFC 3021. A /32 has one address. IPv6 has no broadcast subtraction.

## Guided example

For **10.12.23.90/20**, the third-octet increment is 16. Value 23 lies in 16–31, so the network is **10.12.16.0/20** and its complete endpoint is **10.12.31.255**. It has 4,096 total addresses and 4,094 conventional usable hosts before operational reservations.

## Exercise

Find the network for **10.0.7.9/22**. Its mask is 255.255.252.0, so third-octet blocks have size four. The answer is **10.0.4.0/22**, ending at **10.0.7.255**. Compare the result with binary AND to verify the shortcut independently.

## Standards

- [RFC 4632: CIDR](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 3021: /31 links](https://www.rfc-editor.org/rfc/rfc3021)
