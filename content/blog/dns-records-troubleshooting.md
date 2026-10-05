---
id: dns-records-troubleshooting
title: Read DNS records during troubleshooting without guessing
description: Distinguish missing names from missing record types, compare resolver answers, and preserve TTL and DNSSEC context.
category: Troubleshooting
publishedAt: '2026-10-04'
readingMinutes: 8
---

## Capture the actual DNS question

DNS troubleshooting starts with a precise question: which name, which record type, which resolver, and at what time? Two screenshots can appear contradictory while showing different questions or different cache states. Preserve those details before changing a zone or restarting an application.

The commands and answers below are illustrative. They are not live observations of a domain. Example addresses from `192.0.2.0/24` are documentation values, and real answers should be collected from the environment you are investigating.

## Ask for the record type you need

The DNS model is described in [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034.html), while [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035.html) defines common record formats. Different record types answer different operational questions.

| Type  | What to inspect                         | Frequent misunderstanding                                       |
| ----- | --------------------------------------- | --------------------------------------------------------------- |
| A     | IPv4 addresses associated with a name   | A working A answer does not prove IPv6 works                    |
| AAAA  | IPv6 addresses associated with a name   | An absent AAAA answer does not mean the name is absent          |
| CNAME | Canonical name target                   | The target may need another lookup                              |
| MX    | Mail exchanger preference and hostname  | Preference is not a traffic percentage                          |
| TXT   | Text used by verification and policies  | Displayed text may contain multiple quoted chunks               |
| NS    | Nameservers for a zone                  | A recursive answer is not necessarily an authoritative response |
| PTR   | Hostname associated with a reverse name | Reverse data does not authenticate the current user             |

For an application connection, inspect A and AAAA separately. If the client prefers IPv6, a correct A record may coexist with a broken IPv6 route or application listener. Conversely, removing AAAA without diagnosing the problem can mask the actual network issue.

## Read an answer with its context

An illustrative answer line might be:

```text
app.example. 120 IN A 192.0.2.20
```

The owner name is `app.example.`, the displayed remaining TTL is 120 seconds, the class is IN, the type is A, and the record data is the IPv4 address. The TTL belongs to a record answer; it is not the duration for which the application connection remains valid.

A public recursive resolver may return an answer from its cache. An authoritative server can show updated data while another resolver still has an earlier answer whose TTL has not expired. Record the resolver, retrieval timestamp, and TTL alongside the value so you can compare equivalent observations.

Try questions such as these in an environment where you are authorized to troubleshoot:

```text
dig example.com A
dig example.com AAAA
dig example.com MX
dig example.com NS
```

Before comparing outputs, ensure that search domains or command-line defaults did not expand a short name differently. Fully qualified names make a written incident record easier to reproduce.

## Distinguish three very different failures

`NXDOMAIN` means the queried name does not exist in the relevant DNS answer context. `NOERROR` with no answer of the requested type can mean the name exists but has no such record. This is often called a negative or NODATA answer. A `SERVFAIL` response means the server could not complete resolution successfully; it does not establish that the name is absent.

For example, a domain may publish MX and TXT records but no AAAA record. That is not, by itself, an error. An application demanding an IPv6 address should treat the lack of AAAA differently from a resolver that could not finish the query.

Negative answers can also be cached. [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308.html) explains negative caching and the SOA information used for its lifetime. Adding a previously missing record may therefore require checking negative-cache state as well as the new authoritative data.

When you see SERVFAIL, investigate delegation, nameserver availability, validation, and the resolver's own failure information. Avoid replacing a diagnosis with repeated cache clearing when the authoritative configuration is still inconsistent.

## Follow aliases as a chain of questions

A CNAME answer points from one name to another. The client still needs an address for the eventual canonical name. A correct first alias can therefore lead to a missing or unreachable target.

Record each relevant name and its answer. Check for an unexpected target, a broken terminal record, or a chain that differs between public and internal DNS views. Do not assume an alias must share the same administrative owner as the original name.

For MX, the preference number orders mail-exchanger preference: a lower number is preferred. An MX value of 10 followed by one of 20 does not mean a 10-to-20 traffic split. Inspect the exchanger hostname and its address resolution separately from the original domain's A records.

## Keep DNSSEC claims narrow

DNSSEC adds origin authentication and integrity for DNS data; its purpose is explained in [RFC 4033](https://www.rfc-editor.org/rfc/rfc4033.html). It does not encrypt all DNS traffic or prove that a website is trustworthy. An authenticated-data flag reports the validating resolver's assertion about the answer under the query conditions.

Interpret that flag in relation to the resolver and the transport used to reach it. A DNS-over-HTTPS connection protects that connection to the selected resolver, while DNSSEC concerns validation of DNS data. These are different parts of the path and should be described separately.

A validation problem can surface as SERVFAIL. Useful evidence includes the affected name, time, resolver, whether the problem is reproducible, and any more specific diagnostic information exposed by the resolver. Capture the evidence before modifying delegation or signing settings.

## Check the application boundary

After resolution succeeds, the application can still fail because of routing, a firewall, a refused port, TLS hostname validation, a proxy, or a service error. State the boundary that has actually been verified: “this resolver returned this address at this time” is stronger evidence than “DNS is fine everywhere.”

PTR results deserve similar precision. An address can have no PTR, one PTR, or operationally unexpected reverse data. Forward and reverse names may disagree because different parties manage them. A PTR answer is a registration-style association, not proof of a person's identity.

## Preserve a reproducible record

For each test, record the full name, type, resolver, answer status, returned records, TTLs, retrieval time, and relevant validation flags. Label cached results and distinguish an empty answer from a failed request. If you are comparing internal and public DNS, label the view explicitly.

SubnetIQ's DNS tool returns that context with its record table and explanation. It sends a DNS question to the configured public resolver and displays returned records as data; it does not browse the addresses contained in them. Use a public resolver only for names appropriate to disclose there. Keep internal-only questions within your organization's approved diagnostic environment, then use the same evidence format when you compare the results.
