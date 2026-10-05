# 11. DNS records, caching, and reverse lookups

## Names are a hierarchy of records

A client usually asks a recursive resolver, which answers from cache or follows referrals to authoritative servers. An authoritative server publishes data for its zone. These roles differ even when a software package can perform both.

Record the queried name, type, resolver, retrieval time, and response status when comparing results. One name can have several records, and a DNS answer is not proof that the named service is safe or reachable.

## Interpret each type correctly

| Type  | Meaning                       | Example                     |
| ----- | ----------------------------- | --------------------------- |
| A     | IPv4 address                  | 192.0.2.10                  |
| AAAA  | IPv6 address                  | 2001:db8::10                |
| CNAME | Alias target                  | app.example.net             |
| MX    | Mail exchanger and preference | 10 mail.example.com         |
| NS    | Nameserver                    | ns1.example.net             |
| TXT   | String data                   | Verification or mail policy |
| PTR   | Domain-name pointer           | host.example.com            |

Lower MX preference numbers are preferred, and targets are hostnames, not literal IPs. An ordinary CNAME owner cannot also hold unrelated data. Provider-specific flattening can synthesize records and should not be confused with standard CNAME behavior.

## Why answers differ

TTL describes a cache lifetime. An authoritative update does not erase existing cached answers. Negative responses may also be cached, so a newly created name can remain unseen by a resolver that recently queried it.

**NXDOMAIN** means the name does not exist in that view. An existing name without AAAA may instead yield a successful empty answer. Timeout, refusal, validation failure, and nonexistence are different results and deserve different messages.

Split DNS deliberately gives different views to different clients. Geographic or service policies can also vary answers. Establish context before treating every difference as a fault.

## Reverse names and authority

For **192.0.2.10**, reverse decimal octets and append in-addr.arpa: **10.2.0.192.in-addr.arpa**. A PTR record can associate this name with a hostname.

For IPv6, expand all 32 hexadecimal digits, reverse them individually, separate them with dots, and append ip6.arpa. Each label is a nibble, making four-bit boundaries natural for reverse delegation.

Generating a reverse name does not grant DNS authority. The address holder's delegation arrangements determine who may publish it. IPv4 blocks smaller than octet boundaries may use RFC 2317 classless arrangements.

## Security and exercise

DNSSEC provides signed-data authentication and integrity, not query encryption. DNS over TLS or HTTPS protects a transport hop to a resolver; it does not independently make every destination trustworthy.

If a website fails, query A and AAAA, capture resolver and response status, then test routing, transport, TLS, and application behavior. A correct address answer alone does not establish an open service or valid certificate.

## Standards

- [RFC 1034: DNS concepts](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035: records and messages](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2317: classless reverse delegation](https://www.rfc-editor.org/rfc/rfc2317)
- [RFC 4033: DNSSEC overview](https://www.rfc-editor.org/rfc/rfc4033)
