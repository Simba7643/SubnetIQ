# 10. DHCP and first-hop configuration

## Configuration is a bundle

DHCPv4 supplies a leased address and options such as mask, router, and resolvers. A valid-looking address does not prove all settings are correct. A wrong mask changes on-link decisions; a wrong gateway breaks remote connectivity; a wrong resolver can break names while direct IP access still works.

The usual initial exchange is **Discover, Offer, Request, Acknowledge**. The client finds servers, receives offers, requests a chosen assignment, and receives acknowledgement. DORA is a useful mnemonic, but renewal, rebinding, and rejection use other state transitions.

## Derive a scope from the address plan

A VLAN uses **192.168.20.0/26**, with conventional hosts .1–.62 and gateway .1. Reserve .2–.9 for infrastructure and offer .10–.62 to ordinary clients, if that matches the design. The pool does not redefine the prefix: clients still receive /26 and .63 remains broadcast.

Static assignments and pools must not collide. DHCP reservations link a client identifier to an address according to the actual server's matching rules. A displayed MAC is not always permanent because privacy settings or hardware changes can affect identity.

## Leases and routed clients

A lease is time-bounded. Clients renew before expiry and may later enter rebinding. Inspect actual configured timers instead of assuming every network uses the same duration. An expired assignment cannot simply be kept forever without valid protocol state.

Client broadcasts do not ordinarily cross routers. A relay forwards messages to a remote server and includes subnet-selection context. If several VLANs receive the same wrong scope, inspect relay information and server scope selection before changing unrelated interface masks.

## Protect configuration at the first hop

An unauthorized DHCP server can supply an attacker-controlled gateway or DNS resolver. DHCP snooping identifies trusted server paths and can block offers on endpoint ports. Its bindings can support Dynamic ARP Inspection. Trust configuration must preserve legitimate relay traffic.

A client using **169.254/16** may have failed to obtain ordinary configuration. Check physical link, VLAN placement, scope exhaustion, relay paths, and server health. A link-local address identifies a symptom, not the exact failed component.

## IPv6 does not copy every IPv4 behavior

DHCPv6 provides addresses, options, and delegated prefixes. Router Advertisements provide default-router information and can supply prefixes for SLAAC. A network can combine mechanisms, but DHCPv6 is not a substitute for RA's router-discovery role.

## Exercise and answer

For **192.0.2.0/27**, .1 is gateway and .2–.5 are reserved. How many pool addresses remain from .6 through .30? **25**, using 30−6+1. This operational pool differs from 30 conventional host positions and 32 total subnet addresses.

## Standards

- [RFC 2131: DHCPv4](https://www.rfc-editor.org/rfc/rfc2131)
- [RFC 8415: DHCPv6](https://www.rfc-editor.org/rfc/rfc8415)
- [RFC 4861: router discovery](https://www.rfc-editor.org/rfc/rfc4861)
