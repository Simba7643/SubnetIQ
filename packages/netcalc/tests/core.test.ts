import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  aggregateNetworks,
  contains,
  expandIPv6,
  formatIP,
  formatIPv4,
  formatIPv6,
  intersects,
  MAX4,
  MAX6,
  mergeIntervals,
  networkFrom,
  parseIP,
  parseIPv4,
  parseIPv6,
  parseNetwork,
  prefixMask,
  rangeToNetworks,
  subtractIntervals,
} from '../src/index.js';

describe('IPv4 parsing and formatting', () => {
  it.each([
    ['0.0.0.0', 0n],
    ['255.255.255.255', MAX4],
    ['192.168.1.10', 3232235786n],
    ['128.0.0.0', 2147483648n],
  ])('parses %s exactly', (text, value) => {
    expect(parseIPv4(text)).toBe(value);
    expect(formatIPv4(value)).toBe(text);
  });
  it.each([
    '192.168.01.1',
    '01.2.3.4',
    '1.2.3',
    '1.2.3.4.5',
    '256.0.0.1',
    '-1.2.3.4',
    '1e2.0.0.1',
    '0x7f.0.0.1',
    '127.1',
    '1.2.3. 4',
    '1.2.3.+4',
    '',
    '4294967295',
  ])('rejects ambiguous or invalid address %s', (value) =>
    expect(() => parseIPv4(value)).toThrow(),
  );
  it('rejects values outside the unsigned 32-bit range', () => {
    expect(() => formatIPv4(-1n)).toThrow();
    expect(() => formatIPv4(MAX4 + 1n)).toThrow();
  });
  it('round-trips every generated unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX4 }), (value) => {
        expect(parseIPv4(formatIPv4(value))).toBe(value);
      }),
      { numRuns: 500 },
    );
  });
});

describe('IPv6 parsing and RFC 5952 formatting', () => {
  it.each([
    ['::', '::'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:0DB8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['2001:0:0:1:0:0:0:1', '2001:0:0:1::1'],
    ['2001:db8:0:1:2:3:4:5', '2001:db8:0:1:2:3:4:5'],
    ['0:0:0:0:0:ffff:c000:201', '::ffff:192.0.2.1'],
    ['::ffff:192.0.2.1', '::ffff:192.0.2.1'],
    ['2001:db8::192.0.2.1', '2001:db8::c000:201'],
    ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['1:2:3:4:5:6:7::', '1:2:3:4:5:6:7:0'],
  ])('normalizes %s to %s', (input, output) => expect(formatIPv6(parseIPv6(input))).toBe(output));
  it('expands every hexadecimal group', () =>
    expect(expandIPv6(parseIPv6('2001:db8::1'))).toBe('2001:0db8:0000:0000:0000:0000:0000:0001'));
  it('can display a mapped address entirely in hexadecimal', () =>
    expect(formatIPv6(parseIPv6('::ffff:192.0.2.1'), false)).toBe('::ffff:c000:201'));
  it.each([
    ':::1',
    '1::2::3',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7:8::',
    '1:2:3:4:5:6:7:8:',
    ':1:2:3:4:5:6:7:8',
    '12345::',
    'gggg::',
    'fe80::1%eth0',
    '[::1]',
    '::1/128',
    '::ffff:192.168.001.1',
    '1:2:3:4:5:6:7:192.0.2.1',
    '',
  ])('rejects %s', (value) => expect(() => parseIPv6(value)).toThrow());
  it('rejects out-of-range formatting values', () => {
    expect(() => formatIPv6(-1n)).toThrow();
    expect(() => expandIPv6(MAX6 + 1n)).toThrow();
  });
  it('round-trips generated 128-bit addresses', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX6 }), (value) => {
        expect(parseIPv6(formatIPv6(value))).toBe(value);
        expect(parseIPv6(expandIPv6(value))).toBe(value);
      }),
      { numRuns: 500 },
    );
  });
});

describe('network primitives', () => {
  it('normalizes a host address while preserving the original input integer', () => {
    const network = parseNetwork('192.168.10.77/26');
    expect(network.cidr).toBe('192.168.10.64/26');
    expect(network.address).toBe(parseIPv4('192.168.10.77'));
    expect(network.size).toBe(64n);
    expect(formatIPv4(network.end)).toBe('192.168.10.127');
  });
  it('calculates the complete IPv4 and IPv6 spaces', () => {
    expect(parseNetwork('255.255.255.255/0')).toMatchObject({
      start: 0n,
      end: MAX4,
      size: 4294967296n,
    });
    expect(parseNetwork('ffff::/0')).toMatchObject({
      start: 0n,
      end: MAX6,
      size: 340282366920938463463374607431768211456n,
    });
  });
  it('defaults a plain host address to its full prefix', () => {
    expect(parseNetwork('1.2.3.4').prefix).toBe(32);
    expect(parseNetwork('::1').prefix).toBe(128);
    expect(parseIP('2001:db8::1')).toMatchObject({ family: 6, text: '2001:db8::1' });
    expect(formatIP(parseIPv4('8.8.8.8'), 4)).toBe('8.8.8.8');
  });
  it.each([
    '1.2.3.4/33',
    '1.2.3.4/-1',
    '1.2.3.4/024',
    '1.2.3.4/24/1',
    '1.2.3.4/',
    '::/129',
    '::/64.5',
  ])('rejects invalid CIDR %s', (input) => expect(() => parseNetwork(input)).toThrow());
  it('checks family, prefix and integer boundaries', () => {
    expect(() => parseNetwork('::1', 4)).toThrow('IPv4');
    expect(() => parseNetwork('1.2.3.4', 4, true)).toThrow('prefix');
    expect(() => networkFrom(-1n, 24, 4)).toThrow();
    expect(() => networkFrom(MAX6 + 1n, 64, 6)).toThrow();
    expect(() => prefixMask(33, 32)).toThrow();
    expect(() => prefixMask(2.5, 32)).toThrow();
  });
  it('produces masks without signed 32-bit overflow', () => {
    expect(prefixMask(0, 32)).toBe(0n);
    expect(prefixMask(32, 32)).toBe(MAX4);
    expect(formatIPv4(prefixMask(1, 32))).toBe('128.0.0.0');
    expect(prefixMask(128, 128)).toBe(MAX6);
  });
  it('handles containment across separate address families', () => {
    expect(contains(parseNetwork('10.0.0.0/8'), parseNetwork('10.1.0.0/16'))).toBe(true);
    expect(contains(parseNetwork('10.0.0.0/8'), parseNetwork('11.0.0.0/8'))).toBe(false);
    expect(contains(parseNetwork('0.0.0.0/0'), parseNetwork('::1'))).toBe(false);
    expect(intersects({ start: 1n, end: 10n }, { start: 10n, end: 20n })).toBe(true);
    expect(intersects({ start: 1n, end: 9n }, { start: 10n, end: 20n })).toBe(false);
  });
  it('conserves normalized network size and alignment for random inputs', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX6 }),
        fc.integer({ min: 0, max: 128 }),
        (address, prefix) => {
          const network = networkFrom(address, prefix, 6);
          expect(network.start % network.size).toBe(0n);
          expect(network.end - network.start + 1n).toBe(network.size);
          expect(network.address >= network.start && network.address <= network.end).toBe(true);
          expect(parseNetwork(network.cidr).start).toBe(network.start);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('interval algebra and exact covers', () => {
  it('merges overlapping and adjacent intervals without mutating the input', () => {
    const input = [
      { start: 5n, end: 8n },
      { start: 0n, end: 4n },
      { start: 20n, end: 25n },
      { start: 6n, end: 7n },
    ];
    expect(mergeIntervals(input)).toEqual([
      { start: 0n, end: 8n },
      { start: 20n, end: 25n },
    ]);
    expect(input[0]).toEqual({ start: 5n, end: 8n });
    expect(() => mergeIntervals([{ start: 2n, end: 1n }])).toThrow();
  });
  it('subtracts clipped, merged exclusions exactly', () => {
    expect(
      subtractIntervals({ start: 10n, end: 29n }, [
        { start: 1n, end: 12n },
        { start: 18n, end: 19n },
        { start: 20n, end: 25n },
        { start: 29n, end: 30n },
      ]),
    ).toEqual([
      { start: 13n, end: 17n },
      { start: 26n, end: 28n },
    ]);
    expect(subtractIntervals({ start: 0n, end: 10n }, [{ start: 0n, end: 10n }])).toEqual([]);
    expect(subtractIntervals({ start: 0n, end: 10n }, [])).toEqual([{ start: 0n, end: 10n }]);
  });
  it('covers known awkward IPv4 endpoints without extra addresses', () => {
    expect(
      rangeToNetworks(parseIPv4('192.0.2.5'), parseIPv4('192.0.2.14'), 4).map(
        (network) => network.cidr,
      ),
    ).toEqual(['192.0.2.5/32', '192.0.2.6/31', '192.0.2.8/30', '192.0.2.12/31', '192.0.2.14/32']);
  });
  it('covers complete address spaces with one CIDR', () => {
    expect(rangeToNetworks(0n, MAX4, 4).map((network) => network.cidr)).toEqual(['0.0.0.0/0']);
    expect(rangeToNetworks(0n, MAX6, 6).map((network) => network.cidr)).toEqual(['::/0']);
    expect(rangeToNetworks(MAX6, MAX6, 6)[0]!.prefix).toBe(128);
    expect(() => rangeToNetworks(4n, 3n, 4)).toThrow();
    expect(() => rangeToNetworks(-1n, 3n, 4)).toThrow();
    expect(() => rangeToNetworks(0n, MAX4 + 1n, 4)).toThrow();
  });
  it('preserves interval size, order, and minimality for random IPv6 ranges', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX6 }),
        fc.bigInt({ min: 0n, max: MAX6 }),
        (left, right) => {
          const start = left < right ? left : right;
          const end = left < right ? right : left;
          const networks = rangeToNetworks(start, end, 6);
          expect(networks[0]!.start).toBe(start);
          expect(networks[networks.length - 1]!.end).toBe(end);
          expect(networks.reduce((sum, network) => sum + network.size, 0n)).toBe(end - start + 1n);
          for (let index = 1; index < networks.length; index += 1) {
            const previous = networks[index - 1]!;
            const current = networks[index]!;
            expect(previous.end + 1n).toBe(current.start);
            const mergeable =
              previous.prefix === current.prefix && previous.start % (previous.size * 2n) === 0n;
            expect(mergeable).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
  it('merges sibling networks and eliminates duplicates', () => {
    const inputs = ['192.0.2.0/25', '192.0.2.128/25', '192.0.2.0/26'].map((text) =>
      parseNetwork(text),
    );
    expect(aggregateNetworks(inputs).map((network) => network.cidr)).toEqual(['192.0.2.0/24']);
    expect(() => aggregateNetworks([])).toThrow();
    expect(() => aggregateNetworks([parseNetwork('1.2.3.4'), parseNetwork('::1')])).toThrow();
  });
  it('reassembles every randomly split IPv4 parent', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: MAX4 }),
        fc.integer({ min: 0, max: 28 }),
        fc.integer({ min: 0, max: 4 }),
        (address, prefix, borrowed) => {
          const parent = networkFrom(address, prefix, 4);
          const childPrefix = prefix + borrowed;
          const childSize = 1n << BigInt(32 - childPrefix);
          const children = Array.from({ length: 2 ** borrowed }, (_, index) =>
            networkFrom(parent.start + BigInt(index) * childSize, childPrefix, 4),
          );
          expect(aggregateNetworks(children).map((network) => network.cidr)).toEqual([parent.cidr]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
