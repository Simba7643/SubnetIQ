# 9. NAT and IPv4/IPv6 transitions

## Follow one translated flow

NAT changes addresses across a boundary. Port Address Translation also changes transport ports so several clients can share an external address. The gateway maintains finite mappings and timers, so translation has operational state.

Internal client **10.0.10.20:51514** connects to **198.51.100.40:443**. A gateway might translate the source to **192.0.2.5:62001**. Replies to that external endpoint are mapped back to the client. The server's destination address does not become the gateway address merely because the source is translated.

Different connections can receive different external ports. Expired mappings or an unexpected return path through another stateful device can break a connection even when basic routing looks plausible.

## Deliberate inbound access

A port-forward rule maps an external endpoint to an internal service. Firewall rules separately decide who may use it. Verify the service's listening address, authentication, encryption, updates, and logs before deployment.

An internal client using the public mapped address may require hairpin translation. Split DNS can instead return an internal endpoint to internal clients. Whichever approach is chosen, retain correct hostname and certificate validation rather than bypassing an identity error with an arbitrary IP.

## Private is not trusted

Private addressing describes reuse, not a security guarantee. A compromised internal host may attack other reachable services. Translation can incidentally block unsolicited flows without a mapping, but explicit policy is still required to describe intended access.

Provider translation creates another layer. A customer in shared **100.64.0.0/10** may not control the outer mapping, making inbound publishing a coordination problem. This range is distinct from RFC 1918 space.

## Three different IPv6 concepts

**Dual stack** runs both families, each needing routes, filtering, DNS, and troubleshooting. Clients may select either based on availability and timing.

**IPv4-mapped IPv6**, such as **::ffff:192.0.2.10**, represents an IPv4 endpoint in an IPv6-capable API. It does not automatically create an IPv6 route or tunnel.

**NAT64** translates between families. DNS64 can synthesize an AAAA answer for an IPv4-only service. With the well-known /96 prefix, **192.0.2.10** becomes **64:ff9b::c000:20a**. Other supported prefix lengths have specific embedding rules; do not guess them by concatenation.

Relay-based 6to4 is historical and deprecated. Knowing its encoding is not a recommendation to deploy it.

## Exercise and answer

Does publishing an AAAA record make an IPv4-only server reachable over IPv6? No. The address needs a working IPv6 service path or an intentional translator/proxy. Check DNS, routes, listening sockets, and filtering as separate components.

## Standards

- [RFC 3022: NAT terminology](https://www.rfc-editor.org/rfc/rfc3022)
- [RFC 6052: translator address formats](https://www.rfc-editor.org/rfc/rfc6052)
- [RFC 6146: stateful NAT64](https://www.rfc-editor.org/rfc/rfc6146)
- [RFC 7526: relay-based 6to4 deprecation](https://www.rfc-editor.org/rfc/rfc7526)
