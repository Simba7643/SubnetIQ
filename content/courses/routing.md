# 12. Routing decisions and troubleshooting

## Start with the destination

Suppose a routing table contains **10.0.0.0/8**, **10.20.0.0/16**, **10.20.30.0/24**, and a default route. Destination **10.20.30.9** selects /24. **10.20.40.9** selects /16. **10.90.0.9** selects /8. Otherwise unmatched destinations use /0 if one exists.

This is longest-prefix matching. After selecting a prefix, the router resolves its next hop or interface and applies relevant policy. Vendor route-source preference and protocol metrics compare alternatives for the same prefix; they do not override specificity across different prefixes.

## Build and use the table

Connected routes derive from interfaces, static routes from configuration, and dynamic routes from protocols. OSPF shares link-state topology within an interior domain and uses areas. BGP exchanges prefixes and attributes to implement routing policy within and between autonomous systems.

The control plane learns and chooses routes. The data plane forwards according to installed information. The management plane provides administration and monitoring. A device may forward packets even while its management service is unavailable, so “down” should name the failed function.

## Changes take time

Convergence includes fault detection, calculation, exchange, and installation. Temporary loss or loops can occur while routers transition. IPv4 TTL and IPv6 Hop Limit bound packet circulation without correcting the underlying routing fault.

ECMP distributes flows across equivalent paths, while forward and return traffic can also take different paths. This asymmetry may be valid but affects stateful inspection and translation. Traceroute observes replies to selected probes rather than providing a perfect map of both application directions.

## Diagnose in a useful order

1. Confirm interface state, VLAN, address, and prefix.
2. Inspect the chosen route for the actual destination, including VRF and policy context.
3. Check next-hop ARP or Neighbor Discovery and link reachability.
4. Examine filtering, translation, and the return route.
5. Check DNS, listening services, TLS identity, and application authentication.

Missing ping replies can reflect filtering; successful replies do not prove HTTPS is open. A different DNS answer may represent a deliberate view. Preserve observations instead of changing unrelated settings.

## Summaries and contexts

An aggregate must reflect actual topology and authorized reachability. Unused space within a summary can need discard behavior to avoid looping through an upstream default, while specific routes continue forwarding valid destinations.

Private addresses can repeat intentionally in separate VRFs. Compare within the appropriate address space before diagnosing reuse as a conflict.

## Final exercise

A router has a **10.20.0.0/16** route through a dead next hop and a working default route. Will it automatically choose the default for **10.20.30.9** because that route seems healthy? No. The installed more-specific route wins. Failure detection must withdraw or replace it appropriately.

## Standards

- [RFC 4632: prefixes and routing](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 2328: OSPFv2](https://www.rfc-editor.org/rfc/rfc2328)
- [RFC 4271: BGP](https://www.rfc-editor.org/rfc/rfc4271)
- [RFC 7454: BGP operational security](https://www.rfc-editor.org/rfc/rfc7454)
