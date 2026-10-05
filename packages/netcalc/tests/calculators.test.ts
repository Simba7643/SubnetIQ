import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { toolIds, type ToolId } from '@subnetiq/shared';
import {
  calculate,
  capacity,
  classifyAddress,
  classifyNetwork,
  contains,
  decodeNAT64,
  encodeNAT64,
  formatIPv4,
  formatIPv6,
  historicalClass,
  isGlobalUnicast,
  MAX4,
  parseIPv4,
  parseIPv6,
  parseMAC,
  parseNetwork,
  PREVIEW_LIMIT,
  smallestPrefix,
} from '../src/index.js';

const exampleInputs: Record<ToolId, Record<string, unknown>> = {
  'ipv4-subnet': { address: '192.168.10.14/24', policy: 'lan' },
  'ipv4-split': { network: '192.168.10.0/24', count: 4 },
  vlsm: {
    network: '192.168.10.0/24',
    segments: [
      { name: 'Engineering', hosts: 80 },
      { name: 'Operations', hosts: 40 },
      { name: 'Guest', hosts: 20 },
      { name: 'Router link', hosts: 2, policy: 'point-to-point' },
    ],
  },
  aggregate: { networks: ['192.168.10.0/25', '192.168.10.128/25'], mode: 'exact' },
  'range-to-cidr': { start: '192.0.2.5', end: '192.0.2.14' },
  'cidr-to-range': { network: '2001:db8::/64' },
  overlap: { networks: ['10.0.0.0/8', '10.1.0.0/16'] },
  wildcard: { address: '192.0.2.0/24' },
  convert: { value: '192.168.1.1', fromBase: 10, toBase: 2 },
  classify: { address: '192.0.0.9' },
  'reverse-dns': { address: '192.0.2.128/25' },
  'netmask-table': { min: 0, max: 32, policy: 'lan' },
  'ipv6-subnet': { address: '2001:db8:abcd:1234::1/64' },
  'ipv6-format': { address: '2001:0DB8:0:0:0:0:0:1' },
  eui64: { mac: '00:1A:2B:3C:4D:5E', prefix: 'fe80::/64' },
  'ipv6-plan': { network: '2001:db8::/48', prefix: 64, count: 16 },
  'ipv4-map': { address: '192.0.2.33', mode: 'nat64', prefix: '64:ff9b::/96' },
  bandwidth: { size: 100, sizeUnit: 'MB', speed: 100, speedUnit: 'Mbps', efficiency: 80 },
  mtu: { mtu: 1500, ipVersion: 4, tcpOptions: 12, encapsulation: 0 },
  mac: { address: '001A.2B3C.4D5E' },
};

describe('shared result contract', () => {
  it.each(toolIds)('%s produces a complete deterministic JSON-serializable result', (tool) => {
    const result = calculate(tool, exampleInputs[tool]);
    expect(result.toolId).toBe(tool);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.engineVersion).toBe('1.0.0');
    expect(result).toEqual(calculate(tool, exampleInputs[tool]));
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(calculate(tool, result.normalizedInput).summary).toEqual(result.summary);
  });
  it('rejects unknown tools and malformed inputs', () => {
    expect(() => calculate('missing', {})).toThrow('Unknown tool');
    expect(() => calculate('__proto__', {})).toThrow('Unknown tool');
    expect(() => calculate('mtu', null as unknown as Record<string, unknown>)).toThrow('object');
    expect(() => calculate('mtu', [] as unknown as Record<string, unknown>)).toThrow('object');
  });
});

describe('IPv4 capacity and subnet edges', () => {
  it('matches a known /26 calculation', () => {
    const result = calculate('ipv4-subnet', {
      address: '192.168.10.77/26',
      parent: '192.168.0.0/16',
    });
    expect(result.data).toMatchObject({
      network: '192.168.10.64/26',
      networkAddress: '192.168.10.64',
      mask: '255.255.255.192',
      wildcard: '0.0.0.63',
      broadcast: '192.168.10.127',
      firstUsable: '192.168.10.65',
      lastUsable: '192.168.10.126',
      totalAddresses: '64',
      usableHosts: '62',
      previous: '192.168.10.0/26',
      next: '192.168.10.128/26',
    });
    expect(result.summary.find((field) => field.label === 'Borrowed bits')?.value).toBe(10);
    expect(result.warnings.join(' ')).toContain('normalize');
    expect(result.steps.find((step) => step.title.startsWith('AND'))?.formula).toContain(
      '11000000.10101000.00001010.01001101',
    );
  });
  it('keeps /0 exact and does not imply address-space assignability', () => {
    const result = calculate('ipv4-subnet', { address: '0.0.0.0/0' });
    expect(result.data).toMatchObject({
      totalAddresses: '4294967296',
      usableHosts: '4294967294',
      previous: null,
      next: null,
    });
    expect(result.warnings.join(' ')).toContain('not an assignable');
  });
  it('supports both RFC 3021 endpoints and no directed broadcast', () => {
    const result = calculate('ipv4-subnet', { address: '192.0.2.10/31', policy: 'point-to-point' });
    expect(result.data).toMatchObject({
      firstUsable: '192.0.2.10',
      lastUsable: '192.0.2.11',
      usableHosts: '2',
      reserved: '0',
      broadcast: null,
    });
    expect(capacity(parseNetwork('192.0.2.10/31'), 'lan')).toMatchObject({
      count: 0n,
      first: null,
      last: null,
      supported: false,
    });
  });
  it('treats /32 as one host route', () => {
    expect(calculate('ipv4-subnet', { address: '255.255.255.255/32' }).data).toMatchObject({
      firstUsable: '255.255.255.255',
      lastUsable: '255.255.255.255',
      usableHosts: '1',
      broadcast: null,
      next: null,
    });
  });
  it('applies cloud reservation counts and prefix limits', () => {
    expect(calculate('ipv4-subnet', { address: '10.0.0.0/24', policy: 'aws' }).data).toMatchObject({
      firstUsable: '10.0.0.4',
      lastUsable: '10.0.0.254',
      usableHosts: '251',
      broadcast: null,
      reserved: '5',
    });
    expect(
      calculate('ipv4-subnet', { address: '10.0.0.0/29', policy: 'azure' }).data,
    ).toMatchObject({
      firstUsable: '10.0.0.4',
      lastUsable: '10.0.0.6',
      usableHosts: '3',
      policySupported: true,
    });
    expect(calculate('ipv4-subnet', { address: '10.0.0.0/29', policy: 'gcp' }).data).toMatchObject({
      firstUsable: '10.0.0.2',
      lastUsable: '10.0.0.5',
      usableHosts: '4',
    });
    expect(
      calculate('ipv4-subnet', { address: '10.0.0.0/29', policy: 'aws' }).data?.policySupported,
    ).toBe(false);
    expect(capacity(parseNetwork('10.0.0.0/32'), 'aws').count).toBe(0n);
  });
  it('models the documented BYOIP and secondary-range exceptions explicitly', () => {
    expect(capacity(parseNetwork('10.0.0.0/24'), 'aws', 'byoip')).toMatchObject({
      count: 256n,
      reserved: 0n,
    });
    expect(capacity(parseNetwork('10.0.0.0/24'), 'gcp', 'secondary')).toMatchObject({
      count: 256n,
      reserved: 0n,
    });
    expect(() =>
      calculate('ipv4-subnet', { address: '10.0.0.0/24', policy: 'azure', cloudVariant: 'byoip' }),
    ).toThrow();
  });
  it('chooses the smallest supported prefix under each policy', () => {
    expect(smallestPrefix(1n, 'lan')).toBe(30);
    expect(smallestPrefix(2n, 'point-to-point')).toBe(31);
    expect(smallestPrefix(1n, 'point-to-point')).toBe(32);
    expect(smallestPrefix(11n, 'aws')).toBe(28);
    expect(smallestPrefix(12n, 'aws')).toBe(27);
    expect(smallestPrefix(3n, 'azure')).toBe(29);
    expect(smallestPrefix(4n, 'gcp')).toBe(29);
    expect(() => smallestPrefix(0n, 'lan')).toThrow();
    expect(() => smallestPrefix(4294967296n, 'lan')).toThrow();
    expect(() => capacity(parseNetwork('::/64'), 'lan')).toThrow();
  });
  it('generates all 33 masks including special endpoint rows', () => {
    const result = calculate('netmask-table', {});
    expect(result.rows).toHaveLength(33);
    expect(result.rows?.[0]).toMatchObject({
      cidr: '/0',
      addresses: '4294967296',
      mask: '0.0.0.0',
    });
    expect(result.rows?.[31]).toMatchObject({ cidr: '/31', usable: '0', supported: false });
    expect(result.rows?.[32]).toMatchObject({ cidr: '/32', usable: '1', wildcard: '0.0.0.0' });
  });
});

describe('IPv6 calculation and planning', () => {
  it('uses exact 128-bit counts without a broadcast subtraction', () => {
    expect(calculate('ipv6-subnet', { address: '::/0' }).data).toMatchObject({
      totalAddresses: '340282366920938463463374607431768211456',
      broadcast: null,
    });
    expect(calculate('ipv6-subnet', { address: '2001:db8::/64' }).data?.totalAddresses).toBe(
      '18446744073709551616',
    );
    expect(calculate('ipv6-subnet', { address: '2001:db8::10/127' }).data).toMatchObject({
      totalAddresses: '2',
      firstAddress: '2001:db8::10',
      lastAddress: '2001:db8::11',
      broadcast: null,
    });
    expect(calculate('ipv6-subnet', { address: '2001:db8::1/128' }).data).toMatchObject({
      totalAddresses: '1',
      firstAddress: '2001:db8::1',
      lastAddress: '2001:db8::1',
    });
  });
  it('counts exactly 65536 /64s in a /48', () => {
    const result = calculate('ipv6-plan', { network: '2001:db8:abcd::/48', prefix: 64, count: 16 });
    expect(result.data).toMatchObject({
      totalSubnets: '65536',
      childSize: '18446744073709551616',
      truncated: true,
      nextIndex: '16',
    });
    expect(result.rows?.[15]?.cidr).toBe('2001:db8:abcd:f::/64');
  });
  it('jumps to large exact indices and clamps the final window', () => {
    const result = calculate('ipv6-plan', {
      network: '::/0',
      prefix: 128,
      count: 16,
      startIndex: '340282366920938463463374607431768211455',
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows?.[0]?.cidr).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128');
    expect(result.data?.nextIndex).toBe(null);
  });
  it('retains a supplied IPv6 formatting prefix', () => {
    const result = calculate('ipv6-format', { address: '2001:0DB8:0000::1/64' });
    expect(result.normalizedInput.address).toBe('2001:db8::1/64');
    expect(result.rows).toHaveLength(8);
  });
  it('distinguishes physical reservations from unavailable child positions', () => {
    const result = calculate('ipv6-plan', {
      network: '2001:db8::/60',
      prefix: 64,
      count: 16,
      reserved: ['2001:db8::/65', '2001:db8:0:2::/63'],
    });
    expect(result.data).toMatchObject({
      totalSubnets: '16',
      reservedChildCount: '3',
      availableChildCount: '13',
      reservedAddresses: '46116860184273879040',
      unavailableChildAddresses: '55340232221128654848',
    });
    expect(result.rows?.[0]?.status).toBe('Partially reserved; child unavailable');
    expect(result.rows?.[1]?.status).toBe('Available');
    expect(result.rows?.[2]?.status).toBe('Reserved');
    expect(result.rows?.[3]?.status).toBe('Reserved');
    expect(result.blocks?.[0]).toMatchObject({ color: '#748397', locked: true });
  });
  it('counts merged IPv6 reservations once at very large scale', () => {
    const result = calculate('ipv6-plan', {
      network: '::/0',
      prefix: 64,
      reserved: ['::/1', '::/2'],
    });
    expect(result.data).toMatchObject({
      reservedChildCount: '9223372036854775808',
      availableChildCount: '9223372036854775808',
      reservedAddresses: '170141183460469231731687303715884105728',
    });
  });
  it('rejects invalid or outside-parent IPv6 reservations', () => {
    expect(() =>
      calculate('ipv6-plan', { network: '2001:db8::/48', reserved: ['2001:db9::/64'] }),
    ).toThrow('outside');
    expect(() =>
      calculate('ipv6-plan', { network: '2001:db8::/48', reserved: ['2001:db8::1/64'] }),
    ).toThrow('aligned');
  });
});

describe('split and VLSM planning', () => {
  it('splits a /24 into four complete /26s', () => {
    const result = calculate('ipv4-split', exampleInputs['ipv4-split']);
    expect(result.rows?.map((row) => row.cidr)).toEqual([
      '192.168.10.0/26',
      '192.168.10.64/26',
      '192.168.10.128/26',
      '192.168.10.192/26',
    ]);
    expect(result.data?.unallocated).toEqual([]);
  });
  it('leaves explicit free space for an arbitrary allocation count', () => {
    const result = calculate('ipv4-split', { network: '10.0.0.0/24', prefix: 26, count: 3 });
    expect(result.data?.unallocated).toEqual([
      expect.objectContaining({ cidr: '10.0.0.192/26', size: '64' }),
    ]);
    expect(() => calculate('ipv4-split', { network: '10.0.0.0/24', count: 3 })).toThrow(
      'power-of-two',
    );
  });
  it('bounds huge splits while exposing exact counts and index navigation', () => {
    const result = calculate('ipv4-split', { network: '0.0.0.0/0', count: 4294967296 });
    expect(result.rows).toHaveLength(PREVIEW_LIMIT);
    expect(result.data).toMatchObject({ totalSubnets: '4294967296', truncated: true });
    const end = calculate('ipv4-split', { ...result.normalizedInput, startIndex: '4294967295' });
    expect(end.rows).toHaveLength(1);
    expect(end.rows?.[0]?.cidr).toBe('255.255.255.255/32');
  });
  it('matches the Phase 0 VLSM acceptance fixture', () => {
    const result = calculate('vlsm', exampleInputs.vlsm);
    expect(result.rows?.map((row) => [row.name, row.cidr, row.capacity])).toEqual([
      ['Engineering', '192.168.10.0/25', '126'],
      ['Operations', '192.168.10.128/26', '62'],
      ['Guest', '192.168.10.192/27', '30'],
      ['Router link', '192.168.10.224/31', '2'],
    ]);
    expect(result.data?.freeAddresses).toBe('30');
    const free = result.data?.unallocated as { cidr: string }[];
    expect(free.map((network) => network.cidr)).toEqual([
      '192.168.10.226/31',
      '192.168.10.228/30',
      '192.168.10.232/29',
      '192.168.10.240/28',
    ]);
  });
  it('preserves locks, merges reservations and fills aligned gaps', () => {
    const result = calculate('vlsm', {
      network: '10.0.0.0/24',
      reserved: ['10.0.0.192/26', '10.0.0.192/27'],
      segments: [
        { name: 'Existing', hosts: 40, lockedCidr: '10.0.0.0/26' },
        { name: 'New', hosts: 50 },
      ],
    });
    expect(result.rows?.map((row) => row.cidr)).toEqual(['10.0.0.0/26', '10.0.0.64/26']);
    expect(result.data).toMatchObject({
      reservedAddresses: '64',
      allocatedAddresses: '128',
      freeAddresses: '64',
    });
    expect(result.blocks?.find((block) => block.name === 'Existing')?.locked).toBe(true);
  });
  it('rounds growth upward before selecting a subnet', () => {
    const result = calculate('vlsm', {
      network: '10.0.0.0/24',
      segments: [{ name: 'Small team', hosts: 30, growthPercent: 0.01 }],
    });
    expect(result.rows?.[0]).toMatchObject({ required: '31', cidr: '10.0.0.0/26' });
  });
  it('reports fragmentation instead of moving a lock', () => {
    expect(() =>
      calculate('vlsm', {
        network: '10.0.0.0/24',
        segments: [
          { name: 'A', hosts: 40, lockedCidr: '10.0.0.0/26' },
          { name: 'B', hosts: 40, lockedCidr: '10.0.0.128/26' },
          { name: 'Large', hosts: 80 },
        ],
      }),
    ).toThrow('none remains');
  });
  it('rejects overlapping locks, under-sized locks, and reserved conflicts', () => {
    expect(() =>
      calculate('vlsm', {
        network: '10.0.0.0/24',
        segments: [
          { name: 'A', hosts: 20, lockedCidr: '10.0.0.0/26' },
          { name: 'B', hosts: 10, lockedCidr: '10.0.0.0/27' },
        ],
      }),
    ).toThrow('overlaps');
    expect(() =>
      calculate('vlsm', {
        network: '10.0.0.0/24',
        segments: [{ name: 'A', hosts: 80, lockedCidr: '10.0.0.0/26' }],
      }),
    ).toThrow('80');
    expect(() =>
      calculate('vlsm', {
        network: '10.0.0.0/24',
        reserved: ['10.0.0.0/25'],
        segments: [{ name: 'A', hosts: 10, lockedCidr: '10.0.0.0/27' }],
      }),
    ).toThrow('overlaps');
  });
  it('conserves address space and capacity in random feasible plans', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 20 }),
        (hosts) => {
          const parent = parseNetwork('10.0.0.0/16');
          const result = calculate('vlsm', {
            network: parent.cidr,
            segments: hosts.map((value, index) => ({ name: `Segment ${index}`, hosts: value })),
          });
          const allocations = result.data?.allocations as {
            cidr: string;
            required: string;
            capacity: string;
          }[];
          const networks = allocations.map((entry) => parseNetwork(entry.cidr));
          expect(
            allocations.every((entry) => BigInt(entry.capacity) >= BigInt(entry.required)),
          ).toBe(true);
          expect(networks.every((network) => contains(parent, network))).toBe(true);
          const sorted = [...networks].sort((left, right) => Number(left.start - right.start));
          for (let index = 1; index < sorted.length; index += 1)
            expect(sorted[index - 1]!.end < sorted[index]!.start).toBe(true);
          expect(
            BigInt(result.data?.allocatedAddresses as string) +
              BigInt(result.data?.freeAddresses as string) +
              BigInt(result.data?.reservedAddresses as string),
          ).toBe(parent.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('aggregation, conflict and classification tools', () => {
  it('distinguishes exact summaries from broader covers', () => {
    const input = { networks: ['10.0.0.0/24', '10.0.2.0/24'] };
    expect(calculate('aggregate', { ...input, mode: 'exact' }).data).toMatchObject({
      networks: ['10.0.0.0/24', '10.0.2.0/24'],
      additionalAddressCount: '0',
    });
    expect(calculate('aggregate', { ...input, mode: 'cover' }).data).toMatchObject({
      networks: ['10.0.0.0/22'],
      additionalAddressCount: '512',
      additionalRanges: [
        { start: '10.0.1.0', end: '10.0.1.255', size: '256' },
        { start: '10.0.3.0', end: '10.0.3.255', size: '256' },
      ],
    });
  });
  it('detects duplicates and containment without cross-family conflicts', () => {
    const result = calculate('overlap', {
      networks: ['10.0.0.0/8', '10.1.0.0/16', '10.1.0.0/16', '11.0.0.0/8', '::/0'],
    });
    expect(result.data).toMatchObject({ conflictCount: 3, duplicateCount: 1, containmentCount: 2 });
    expect(result.warnings.join(' ')).toContain('independently');
  });
  it('counts conflicts beyond its row preview', () => {
    const result = calculate('overlap', { networks: Array<string>(30).fill('10.0.0.0/8') });
    expect(result.data).toMatchObject({ conflictCount: 435, duplicateCount: 435, truncated: true });
    expect(result.rows).toHaveLength(PREVIEW_LIMIT);
  });
  it.each([
    ['10.1.2.3', 'Private RFC 1918', false],
    ['100.64.0.1', 'Carrier-grade NAT', false],
    ['169.254.1.1', 'Link-local / APIPA', false],
    ['192.0.0.9', 'Protocol anycast', true],
    ['192.0.0.8', 'Dummy address', false],
    ['192.0.0.170', 'Translation discovery', false],
    ['192.88.99.2', '6a44 relay anycast', false],
    ['192.0.2.1', 'Documentation', false],
    ['198.18.1.1', 'Benchmarking', false],
    ['255.255.255.255', 'Limited broadcast', false],
    ['224.0.0.1', 'Link-local multicast', false],
    ['239.1.2.3', 'Administrative multicast', false],
    ['2001:db8::1', 'Documentation', false],
    ['3fff::1', 'Documentation', false],
    ['2001:1::3', 'Protocol anycast', true],
    ['100:0:0:1::1', 'Dummy address', false],
    ['fc00::1', 'Unique local', false],
    ['fe80::1', 'Link-local', false],
    ['2001:4860:4860::8888', 'Global unicast', true],
  ])('classifies %s using the longest match', (input, category, global) => {
    const family = input.includes(':') ? 6 : 4;
    const value = family === 4 ? parseIPv4(input) : parseIPv6(input);
    expect(classifyAddress(value, family)).toMatchObject({ category, globallyReachable: global });
  });
  it('detects mixed classes in a range rather than classifying only its base', () => {
    const result = calculate('classify', { address: '192.0.0.0/24' });
    expect(result.data?.mixed).toBe(true);
    expect(
      result.rows?.some((row) => row.start === '192.0.0.9' && row.globallyReachable === true),
    ).toBe(true);
    const parent = parseNetwork('0.0.0.0/0');
    const partitions = classifyNetwork(parent);
    expect(partitions.reduce((sum, item) => sum + item.end - item.start + 1n, 0n)).toBe(
      parent.size,
    );
    expect(partitions[0]!.start).toBe(0n);
    expect(partitions[partitions.length - 1]!.end).toBe(MAX4);
  });
  it('keeps historic classes separate from current forwarding classification', () => {
    expect(historicalClass(parseNetwork('127.0.0.1'))).toBe('Class A (historical)');
    expect(historicalClass(parseNetwork('0.0.0.0/0'))).toContain('multiple');
    expect(historicalClass(parseNetwork('::1'))).toContain('Not applicable');
    expect(isGlobalUnicast('8.8.8.8')).toBe(true);
    expect(isGlobalUnicast('10.0.0.1')).toBe(false);
    expect(isGlobalUnicast('224.1.1.1')).toBe(false);
    expect(() => classifyAddress(-1n, 4)).toThrow('unsigned');
    expect(() => classifyAddress(MAX4 + 1n, 4)).toThrow('unsigned');
  });
});

describe('wildcards, bases, MACs, reverse DNS and packet budgets', () => {
  it('produces exact CIDRs for a noncontiguous wildcard', () => {
    const result = calculate('wildcard', { address: '10.0.4.27', mask: '0.0.5.255' });
    expect(result.data).toMatchObject({
      address: '10.0.0.0',
      contiguous: false,
      cidr: null,
      cidrs: ['10.0.0.0/23', '10.0.4.0/23'],
      cidrCount: '2',
      matchedAddresses: '1024',
    });
  });
  it('handles all-wildcard and exact-host masks', () => {
    expect(
      calculate('wildcard', { address: '10.1.2.3', mask: '255.255.255.255' }).data,
    ).toMatchObject({ cidr: '0.0.0.0/0', matchedAddresses: '4294967296' });
    expect(calculate('wildcard', { address: '10.1.2.3', mask: '0.0.0.0' }).data?.cidr).toBe(
      '10.1.2.3/32',
    );
    expect(
      calculate('wildcard', { address: '10.1.2.3', mask: '255.255.255.254' }).rows,
    ).toHaveLength(PREVIEW_LIMIT);
  });
  it('preserves every generated IPv4 CIDR through wildcard conversion', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX4 }),
        fc.integer({ min: 0, max: 32 }),
        (address, prefix) => {
          const network = parseNetwork(`${formatIPv4(address)}/${prefix}`);
          const result = calculate('wildcard', { address: network.cidr });
          expect(result.data?.cidr).toBe(network.cidr);
          expect(result.data?.matchedAddresses).toBe(network.size.toString());
        },
      ),
      { numRuns: 100 },
    );
  });
  it('converts dotted octets and arbitrarily large integers exactly', () => {
    expect(calculate('convert', exampleInputs.convert).data?.converted).toBe(
      '11000000.10101000.00000001.00000001',
    );
    expect(
      calculate('convert', { value: 'ffffffffffffffffffffffffffffffff', fromBase: 16, toBase: 10 })
        .data?.converted,
    ).toBe('340282366920938463463374607431768211455');
    expect(calculate('convert', { value: '-0xff', fromBase: 16, toBase: 10 }).data?.converted).toBe(
      '-255',
    );
    expect(calculate('convert', { value: '0o377', fromBase: 8, toBase: 2 }).data?.converted).toBe(
      '11111111',
    );
  });
  it('normalizes MAC variants and analyzes address bits', () => {
    expect(parseMAC('001A.2B3C.4D5E')).toEqual([0, 26, 43, 60, 77, 94]);
    expect(parseMAC('00-1a-2b-3c-4d-5e')).toEqual(parseMAC('001a2b3c4d5e'));
    expect(calculate('mac', { address: '02:00:00:00:00:01' }).data).toMatchObject({
      locallyAdministered: true,
      multicast: false,
    });
    expect(calculate('mac', { address: 'ff:ff:ff:ff:ff:ff' }).data).toMatchObject({
      broadcast: true,
      multicast: true,
    });
    expect(() => parseMAC('00:1A-2B:3C:4D:5E')).toThrow();
  });
  it('generates modified EUI-64 with the universal/local bit toggled', () => {
    expect(calculate('eui64', exampleInputs.eui64).data).toMatchObject({
      interfaceId: '021a:2bff:fe3c:4d5e',
      address: 'fe80::21a:2bff:fe3c:4d5e',
    });
    expect(
      calculate('eui64', { mac: '02:1a:2b:3c:4d:5e', prefix: '2001:db8::/64' }).data?.interfaceId,
    ).toBe('001a:2bff:fe3c:4d5e');
  });
  it('generates exact reverse host names and boundary-aligned zones', () => {
    expect(calculate('reverse-dns', { address: '192.0.2.1' }).data?.hostName).toBe(
      '1.2.0.192.in-addr.arpa.',
    );
    expect(calculate('reverse-dns', { address: '192.0.2.0/24' }).data?.zones).toEqual([
      '2.0.192.in-addr.arpa.',
    ]);
    expect(calculate('reverse-dns', { address: '2001:db8::/32' }).data?.zones).toEqual([
      '8.b.d.0.1.0.0.2.ip6.arpa.',
    ]);
    expect(calculate('reverse-dns', { address: '::1' }).data?.hostName).toBe(
      '1.' + '0.'.repeat(31) + 'ip6.arpa.',
    );
  });
  it('generates classless IPv4 aliases and nibble-safe IPv6 delegations', () => {
    const result = calculate('reverse-dns', { address: '192.0.2.128/25' });
    expect(result.data?.zones).toEqual(['128-255.2.0.192.in-addr.arpa.']);
    expect(result.data?.parentCnames).toHaveLength(128);
    expect((result.data?.parentCnames as string[])[0]).toBe(
      '128.2.0.192.in-addr.arpa. IN CNAME 128.128-255.2.0.192.in-addr.arpa.',
    );
    expect(calculate('reverse-dns', { address: '2001:db8::/33' }).data?.zones).toHaveLength(8);
    expect(calculate('reverse-dns', { address: '10.0.0.0/9' }).data?.zones).toHaveLength(128);
  });
  it('distinguishes decimal bytes, binary bytes and effective link rate', () => {
    expect(calculate('bandwidth', exampleInputs.bandwidth).data).toMatchObject({
      bytes: '100000000',
      bits: '800000000',
      effectiveBitsPerSecond: '80000000',
      seconds: 10,
    });
    expect(
      calculate('bandwidth', { size: 1, sizeUnit: 'MiB', speed: 8, speedUnit: 'Mbps' }).data
        ?.seconds,
    ).toBe(1.048576);
    expect(
      calculate('bandwidth', { size: 0, sizeUnit: 'B', speed: 1, speedUnit: 'bps' }).data?.seconds,
    ).toBe(0);
  });
  it('distinguishes advertised MSS from actual packet data with options', () => {
    expect(calculate('mtu', exampleInputs.mtu).data).toMatchObject({
      innerMtu: 1500,
      baseMss: 1460,
      tcpPayload: 1448,
      udpPayload: 1472,
    });
    expect(
      calculate('mtu', { mtu: 1500, ipVersion: 6, tcpOptions: 12, encapsulation: 50 }).data,
    ).toMatchObject({ innerMtu: 1450, baseMss: 1390, tcpPayload: 1378 });
    expect(
      calculate('mtu', { mtu: 1280, ipVersion: 6, encapsulation: 50 }).warnings.join(' '),
    ).toContain('1280');
  });
});

describe('IPv4-mapped, NAT64 and historical 6to4 transitions', () => {
  const fixtures = [
    ['2001:db8::/32', '2001:db8:c000:221::'],
    ['2001:db8:100::/40', '2001:db8:1c0:2:21::'],
    ['2001:db8:122::/48', '2001:db8:122:c000:2:2100::'],
    ['2001:db8:122:300::/56', '2001:db8:122:3c0:0:221::'],
    ['2001:db8:122:344::/64', '2001:db8:122:344:c0:2:2100:0'],
    ['2001:db8:122:344::/96', '2001:db8:122:344::c000:221'],
    ['64:ff9b::/96', '64:ff9b::c000:221'],
  ];
  it.each(fixtures)('matches the RFC 6052 known-answer layout for %s', (prefix, encoded) => {
    const ipv4 = parseIPv4('192.0.2.33');
    expect(formatIPv6(encodeNAT64(ipv4, prefix))).toBe(encoded);
    expect(decodeNAT64(parseIPv6(encoded), prefix)).toBe(ipv4);
  });
  it('round-trips random addresses in every supported translation layout', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX4 }),
        fc.constantFrom(...fixtures.map((fixture) => fixture[0]!)),
        (ipv4, prefix) => {
          expect(decodeNAT64(encodeNAT64(ipv4, prefix), prefix)).toBe(ipv4);
        },
      ),
      { numRuns: 250 },
    );
  });
  it('rejects unsupported prefixes, mismatches and reserved u octets', () => {
    expect(() => encodeNAT64(1n, '2001:db8::/72')).toThrow('RFC 6052');
    expect(() => encodeNAT64(1n, '2001:db8::1/96')).toThrow('aligned');
    expect(() => encodeNAT64(1n, '2001:db8:0:0:100::/96')).toThrow('u octet');
    expect(() => decodeNAT64(parseIPv6('2002::1'), '64:ff9b::/96')).toThrow('outside');
    expect(() => decodeNAT64(parseIPv6('2001:db8:c000:221:100::'), '2001:db8::/32')).toThrow(
      'u octet',
    );
  });
  it('supports mapped round trips and the historical /48 representation', () => {
    expect(calculate('ipv4-map', { address: '192.0.2.33', mode: 'mapped' }).data?.result).toBe(
      '::ffff:192.0.2.33',
    );
    expect(
      calculate('ipv4-map', { address: '::ffff:192.0.2.33', mode: 'mapped' }).data?.result,
    ).toBe('192.0.2.33');
    expect(calculate('ipv4-map', { address: '192.0.2.33', mode: '6to4' }).data?.result).toBe(
      '2002:c000:221::/48',
    );
    expect(
      calculate('ipv4-map', { address: '2002:c000:221:12::1', mode: '6to4' }).data?.result,
    ).toBe('192.0.2.33');
  });
  it('labels non-global well-known-prefix encodings as mathematical examples', () => {
    const result = calculate('ipv4-map', { address: '10.0.0.1', mode: 'nat64' });
    expect(result.data?.operationallyEligible).toBe(false);
    expect(result.warnings.join(' ')).toContain('prohibits');
  });
});

describe('invalid tool input boundaries', () => {
  it.each<[ToolId, Record<string, unknown>]>([
    ['ipv4-subnet', { address: '192.168.01.1/24' }],
    ['ipv4-subnet', { address: '192.168.1.1/24', policy: 'invalid' }],
    ['ipv4-subnet', { address: '192.168.1.1/24', parent: '10.0.0.0/8' }],
    ['ipv4-split', { network: '192.0.2.0/24', count: 3 }],
    ['ipv4-split', { network: '192.0.2.0/24', prefix: 23 }],
    ['ipv4-split', { network: '192.0.2.0/24', count: 2, startIndex: '2' }],
    ['vlsm', { network: '10.0.0.0/24', segments: [] }],
    ['vlsm', { network: '10.0.0.0/24', segments: [{ name: 'A', hosts: -1 }] }],
    [
      'vlsm',
      { network: '10.0.0.0/24', segments: [{ name: 'A', hosts: 1, growthPercent: 0.0001 }] },
    ],
    [
      'vlsm',
      {
        network: '10.0.0.0/24',
        segments: [
          { name: 'A', hosts: 1 },
          { name: 'a', hosts: 1 },
        ],
      },
    ],
    ['aggregate', { networks: ['10.0.0.0/8', '::1'] }],
    ['aggregate', { networks: ['10.0.0.0/8'], mode: 'bad' }],
    ['range-to-cidr', { start: '192.0.2.2', end: '192.0.2.1' }],
    ['range-to-cidr', { start: '192.0.2.1', end: '::1' }],
    ['cidr-to-range', { network: '192.0.2.0' }],
    ['overlap', { networks: ['10.0.0.0/8'] }],
    ['wildcard', { address: '10.0.0.0/8', mask: '0.0.0.255' }],
    ['convert', { value: '102', fromBase: 2, toBase: 10 }],
    ['convert', { value: '255', fromBase: 3, toBase: 10 }],
    ['classify', { address: 'not an address' }],
    ['reverse-dns', { address: '2001:db8:::1' }],
    ['netmask-table', { min: 31, max: 24 }],
    ['ipv6-subnet', { address: '2001:db8::/129' }],
    ['ipv6-format', { address: '1::2::3' }],
    ['eui64', { mac: '01:00:5E:00:00:01', prefix: 'fe80::/64' }],
    ['eui64', { mac: '00:11:22:33:44:55', prefix: 'fe80::/48' }],
    ['ipv6-plan', { network: '2001:db8::/64', prefix: 48 }],
    ['ipv6-plan', { network: '2001:db8::/64', prefix: 64, startIndex: '1' }],
    ['ipv4-map', { address: '::1', mode: 'mapped' }],
    ['bandwidth', { size: 1, speed: 0 }],
    ['bandwidth', { size: 1, speed: 10, efficiency: 0 }],
    ['bandwidth', { size: 1, speed: 10, sizeUnit: 'watts' }],
    ['mtu', { mtu: 1500, ipVersion: 5 }],
    ['mtu', { mtu: 1500, tcpOptions: 7 }],
    ['mtu', { mtu: 1500, encapsulation: 1490 }],
    ['mac', { address: '00:11:22:33:44' }],
  ])('%s rejects malformed or impossible input %#', (tool, input) =>
    expect(() => calculate(tool, input)).toThrow(),
  );
});
