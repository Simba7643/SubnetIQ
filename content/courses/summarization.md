# 7. Exact aggregation and covering summaries

## Exact union and single cover

Exact aggregation returns a minimal CIDR set representing precisely the input union. A single covering summary returns one prefix containing all inputs, potentially adding gaps. This distinction matters for route advertisements, firewall rules, and allocation ownership.

**192.0.2.0/25** and **192.0.2.128/25** are equal, adjacent, and aligned siblings. Together they form **192.0.2.0/24** with no added addresses.

By contrast, **192.0.2.0/26** and **192.0.2.128/26** cover .0–.63 and .128–.191. Their single /24 cover adds .64–.127 and .192–.255. Exact aggregation must retain the separate /26s.

## Alignment decides whether adjacency is enough

**192.0.2.128/25** and **192.0.3.0/25** are adjacent, but their combined start is not a /24 boundary. They cannot merge into an exact /24. Their smallest single covering prefix is **192.0.2.0/23**, which introduces additional space.

A robust process normalizes inputs, removes duplicate or contained blocks, sorts intervals, merges aligned siblings, and repeats. For arbitrary intervals, choose the largest aligned block starting at the current address without crossing the upper bound, then continue.

## Routing adds topology and policy

Longest-prefix matching prefers more specific routes. A /24 can override a covering /16 for destinations inside that /24. An aggregate therefore reduces ordinary state while allowing deliberate exceptions.

Advertising a summary claims a path to its whole range. If unused destinations are sent back toward an upstream default, a loop can arise. A deliberate discard route at the summary origin can contain unused portions while more specific valid routes keep working. This is an operational choice, not proof that every address in the summary is assigned.

Do not advertise prefixes solely because a calculator can form them. The actual topology, address authorization, and peer policy must support the announcement.

## Worked interval conversion

Represent **192.0.2.10–192.0.2.20** exactly. At .10, use /31 for .10–.11. At .12, use /30 for .12–.15. At .16, the upper bound prevents /29, so use /30 for .16–.19. Finish with .20/32. The four blocks contain 2+4+4+1 = **11** addresses, matching 20−10+1.

Here /31 describes a two-address interval. Deploying it as a router link is a separate policy decision.

## Exercise and answer

The four networks **10.10.0.0/24** through **10.10.3.0/24** aggregate exactly into **10.10.0.0/22**. First merge paired /24s into two /23s, then merge those siblings. If one /24 is absent, the /22 becomes a covering summary with a gap rather than an exact union.

## Standards

- [RFC 4632: aggregation and advertisements](https://www.rfc-editor.org/rfc/rfc4632)
