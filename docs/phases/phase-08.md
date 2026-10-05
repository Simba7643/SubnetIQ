# Phase 8 — Networking and security toolkit

## Delivered

The toolkit is available at /toolkit and /toolkit/:section. All fourteen section routes use the shared design system, deterministic network engine, and result exports.

| Area                 | Implemented behavior                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and protocols  | Searchable offline tables with transport filters, security notes, source links, and exportable filtered results                                    |
| OSI and TCP/IP       | Seven-layer and four-layer views, selected-layer explanations, and a five-step encapsulation explorer                                              |
| MAC and OUI          | Input normalization, address flags, selected-prefix lookup, and explicit handling of locally administered and multicast addresses                  |
| DNS                  | A, AAAA, MX, TXT, NS, CNAME, and PTR requests through the backend; cancellation, loading, source metadata, and honest errors                       |
| IP registration      | Backend RDAP registration lookup for a literal IPv4 or IPv6 address                                                                                |
| Firewall helpers     | IPv4/IPv6 iptables, UFW, Cisco extended ACL generation, and a labeled pfSense interface-rule worksheet                                             |
| Password strength    | Browser-local zxcvbn assessment with pattern advice and an explicit estimate label                                                                 |
| Hashing              | Browser Web Crypto SHA-256, SHA-384, and SHA-512 over exact UTF-8 input                                                                            |
| HTTP and TLS         | Local header interpretation, credential redaction, method/status references, and an interactive TLS 1.3 full-handshake explanation                 |
| Threats and defenses | Searchable learning cards, possible indicators, layered defenses, and exportable briefs                                                            |
| CVSS                 | CVSS 4.0 cards and a parser for all four metric groups, including ordering and case validation                                                     |
| Commands             | Searchable platform-specific command references, syntax, examples, and exportable command briefs                                                   |
| Bandwidth and MTU    | Functional engine-backed transfer-time and packet-budget forms, with links to the full calculators                                                 |
| Network templates    | Home, small-business, campus, and data-center plans with locked IPv4 allocations, VLANs, gateways, purpose, and paired documentation IPv6 prefixes |

Templates are available at /templates?template=home, smb, campus, and data-center. Users can open their complete requirements in the VLSM planner, export a plan immediately, and save a project when account services are configured. Saved projects retain template metadata and both address families.

The bundled datasets contain 49 port entries, 22 protocol entries, 10 selected OUI prefixes, 12 threat cards, 16 command entries, 16 CVSS/vulnerability cards, and 4 network templates. These are curated subsets, not full registries.

## Correctness and privacy decisions

Firewall inputs accept literal IP addresses or CIDRs. The helper normalizes network boundaries, validates the selected family and transport ports, and rejects command text. UFW any-address output uses an explicit family-wide CIDR so it does not accidentally create a dual-family rule. Cisco output converts IPv4 prefixes to wildcard masks. Unsupported combinations produce actionable validation errors.

The pfSense output is a worksheet for an interface rule; it is never labeled as an importable configuration. Firewall text and command-library examples are not executed.

Password and hash source inputs remain in component state. They are excluded from structured results, URLs, exports, history, and AI attachments. Input panels are hidden from printing. Password results keep only score and guidance, never the zxcvbn match sequence. Hash results identify encoding and byte count while preserving every source space and line break during calculation.

HTTP interpretation redacts recognized authorization, cookie, token, secret, and API-key fields. It excludes message bodies and request query strings from the report. It performs a local syntax and meaning review, not a live server assessment.

The CVSS reader decodes a vector and identifies metric groups. It does not invent a score; an exact-vector link opens the official FIRST calculator. Supplemental metrics remain distinct from score-affecting metrics.

The TLS material references [RFC 9846](https://www.rfc-editor.org/info/rfc9846/), published in July 2026, and [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525.html) for service identity. HTTP semantics, caching, browser policies, registry entries, and security cards link to their primary sources in the application.

## Verification

Executed successfully:

- node_modules/.bin/vitest run apps/web/src/features/toolkit — 37 tests in two files.
- node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit — passed at the integration checkpoint.
- node_modules/.bin/eslint apps/web/src/features/toolkit — passed.
- Scoped Prettier formatting applied to the toolkit source.

Tests cover known firewall output, family handling, invalid ports and command-like input, complete CVSS vectors, header redaction and framing ambiguity, SHA-256 reference digests, preservation of exact UTF-8 input, exclusion of sensitive source values, and all four template allocation/gateway invariants. UI tests exercise filtered references, firewall creation, DNS request serialization, failure states, password clearing and print exclusion, and template planner handoff without configured accounts.

Frontend tests mock backend lookup responses. A successful mock verifies the UI contract; it is not evidence that a live resolver, registry, or hosted account was reached. Final screenshots, end-to-end browser checks, and deployment validation are tracked at the release level.
