import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/python-ipaddress.json';
import ipv4Data from '../../../data/special-ipv4.json';
import ipv6Data from '../../../data/special-ipv6.json';
import { formatIP, parseIP, parseNetwork, rangeToNetworks } from '../src/index.js';
import { ipv4Registry, ipv6Registry } from '../src/registry.js';

describe('independent Python ipaddress network fixtures', () => {
  it.each(fixtures.networks)('matches $input', (fixture) => {
    const network = parseNetwork(fixture.input);
    expect(network.cidr).toBe(fixture.network);
    expect(formatIP(network.start, network.family)).toBe(fixture.start);
    expect(formatIP(network.end, network.family)).toBe(fixture.end);
    expect(network.size.toString()).toBe(fixture.size);
  });
  it.each(fixtures.ranges)('matches the exact cover $start through $end', (fixture) => {
    const first = parseIP(fixture.start);
    const last = parseIP(fixture.end);
    expect(
      rangeToNetworks(first.value, last.value, first.family).map((network) => network.cidr),
    ).toEqual(fixture.cidrs);
  });
});

describe('bundled reference data consistency', () => {
  it('keeps the browser registry identical to the versioned JSON snapshots', () => {
    expect(ipv4Registry).toEqual(ipv4Data);
    expect(ipv6Registry).toEqual(ipv6Data);
  });
  it('has unique canonical registrations, valid families and explicit provenance', () => {
    for (const entries of [ipv4Registry, ipv6Registry]) {
      const cidrs = entries.map((entry) => parseNetwork(entry.cidr).cidr);
      expect(new Set(cidrs).size).toBe(entries.length);
      for (const entry of entries) {
        expect(parseNetwork(entry.cidr).family).toBe(entry.family);
        expect(entry.registryVersion).toBe('2025-10-09');
        expect(entry.reviewedAt).toBe('2026-10-04');
        expect(entry.sourceUrl).toMatch(/^https:\/\//);
        expect(['registry', 'architectural']).toContain(entry.kind);
      }
    }
  });
});
