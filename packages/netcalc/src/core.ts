import { ENGINE_VERSION, type CalculationResult, type ResultField } from '@subnetiq/shared';

export type Family = 4 | 6;
export interface IPAddress {
  family: Family;
  value: bigint;
  text: string;
}
export interface Network {
  family: Family;
  bits: 32 | 128;
  address: bigint;
  start: bigint;
  end: bigint;
  prefix: number;
  size: bigint;
  cidr: string;
}
export interface Interval {
  start: bigint;
  end: bigint;
}
export const PREVIEW_LIMIT = 256;
export const INPUT_LIMIT = 1000;
export const MAX4 = (1n << 32n) - 1n;
export const MAX6 = (1n << 128n) - 1n;

export function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function stringInput(value: unknown, label: string, fallback?: string): string {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  requireCondition(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireCondition(
    result.length > 0 && result.length <= 4096,
    `${label} must contain between 1 and 4096 characters.`,
  );
  return result;
}

export function integerInput(
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  if ((value === undefined || value === null || value === '') && fallback !== undefined)
    return fallback;
  requireCondition(
    typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())),
    `${label} must be a whole number.`,
  );
  const result = Number(value);
  requireCondition(
    Number.isSafeInteger(result) && result >= min && result <= max,
    `${label} must be a whole number from ${min} to ${max}.`,
  );
  return result;
}

export function decimalInput(
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  if ((value === undefined || value === null || value === '') && fallback !== undefined)
    return fallback;
  requireCondition(
    typeof value === 'number' ||
      (typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())),
    `${label} must be a finite decimal number.`,
  );
  const result = Number(value);
  requireCondition(
    Number.isFinite(result) && result >= min && result <= max,
    `${label} must be from ${min} to ${max}.`,
  );
  return result;
}

export function decimalBigInt(value: unknown, label: string, fallback = '0'): bigint {
  const text = stringInput(
    value === undefined
      ? fallback
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : value,
    label,
  );
  requireCondition(
    /^\d{1,40}$/.test(text),
    `${label} must be a nonnegative decimal integer with at most 40 digits.`,
  );
  return BigInt(text);
}

export function stringList(value: unknown, label: string, min = 1, max = INPUT_LIMIT): string[] {
  requireCondition(
    Array.isArray(value) && value.length >= min && value.length <= max,
    `${label} must contain ${min} to ${max} entries.`,
  );
  return value.map((entry, index) => stringInput(entry, `${label} entry ${index + 1}`));
}

export function parseIPv4(input: string): bigint {
  requireCondition(typeof input === 'string', 'IPv4 address must be text.');
  const text = input.trim();
  const parts = text.split('.');
  requireCondition(
    parts.length === 4 &&
      parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255),
    'Enter four IPv4 octets from 0 to 255, without leading zeroes, for example 192.168.1.10.',
  );
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n);
}

export function formatIPv4(value: bigint): string {
  requireCondition(
    typeof value === 'bigint' && value >= 0n && value <= MAX4,
    'IPv4 integer must be between 0 and 4294967295.',
  );
  return [24n, 16n, 8n, 0n].map((shift) => ((value >> shift) & 255n).toString()).join('.');
}

export function parseIPv6(input: string): bigint {
  requireCondition(typeof input === 'string', 'IPv6 address must be text.');
  let text = input.trim().toLowerCase();
  requireCondition(
    text.length > 0 && text.length <= 45,
    'Enter an IPv6 address containing up to eight hexadecimal groups.',
  );
  requireCondition(
    !text.includes('%'),
    'Enter the IPv6 address without a zone identifier such as %eth0; interface scope is separate from address mathematics.',
  );
  requireCondition(
    !text.includes('/') && !text.includes('[') && !text.includes(']'),
    'Enter a plain IPv6 address; use the subnet tool for CIDR prefixes.',
  );
  if (text.includes('.')) {
    const position = text.lastIndexOf(':');
    requireCondition(
      position >= 0,
      'An embedded IPv4 address must follow IPv6 hexadecimal groups.',
    );
    const ipv4 = parseIPv4(text.slice(position + 1));
    text = `${text.slice(0, position + 1)}${(ipv4 >> 16n).toString(16)}:${(ipv4 & 65535n).toString(16)}`;
  }
  requireCondition(
    /^[\da-f:]+$/.test(text) && !text.includes(':::'),
    'IPv6 groups may contain only hexadecimal digits and colons.',
  );
  const compressed = text.includes('::');
  let groups: string[];
  if (compressed) {
    requireCondition(
      text.indexOf('::') === text.lastIndexOf('::'),
      'IPv6 may contain only one :: compression.',
    );
    const [left = '', right = ''] = text.split('::');
    const leftGroups = left === '' ? [] : left.split(':');
    const rightGroups = right === '' ? [] : right.split(':');
    requireCondition(
      leftGroups.length + rightGroups.length < 8,
      'The :: abbreviation must replace at least one zero group.',
    );
    groups = [
      ...leftGroups,
      ...Array<string>(8 - leftGroups.length - rightGroups.length).fill('0'),
      ...rightGroups,
    ];
  } else {
    groups = text.split(':');
  }
  requireCondition(
    groups.length === 8 && groups.every((group) => /^[\da-f]{1,4}$/.test(group)),
    'IPv6 must have eight groups of one to four hexadecimal digits, or one valid :: abbreviation.',
  );
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

export function expandIPv6(value: bigint): string {
  requireCondition(
    typeof value === 'bigint' && value >= 0n && value <= MAX6,
    'IPv6 integer must fit in 128 unsigned bits.',
  );
  return Array.from({ length: 8 }, (_, index) =>
    ((value >> BigInt((7 - index) * 16)) & 65535n).toString(16).padStart(4, '0'),
  ).join(':');
}

export function formatIPv6(value: bigint, mappedDotted = true): string {
  const groups = expandIPv6(value)
    .split(':')
    .map((group) => Number.parseInt(group, 16).toString(16));
  if (mappedDotted && value >> 32n === 65535n) return `::ffff:${formatIPv4(value & MAX4)}`;
  let longestStart = -1;
  let longestLength = 1;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== '0') {
      index += 1;
      continue;
    }
    const start = index;
    while (index < groups.length && groups[index] === '0') index += 1;
    if (index - start > longestLength) {
      longestStart = start;
      longestLength = index - start;
    }
  }
  if (longestStart === -1) return groups.join(':');
  const left = groups.slice(0, longestStart).join(':');
  const right = groups.slice(longestStart + longestLength).join(':');
  return `${left}::${right}`;
}

export function parseIP(input: string, requiredFamily?: Family): IPAddress {
  const text = stringInput(input, 'IP address');
  const family: Family = text.includes(':') ? 6 : 4;
  requireCondition(
    requiredFamily === undefined || family === requiredFamily,
    `This tool requires an IPv${requiredFamily} address.`,
  );
  const value = family === 4 ? parseIPv4(text) : parseIPv6(text);
  return { family, value, text: formatIP(value, family) };
}

export function formatIP(value: bigint, family: Family): string {
  return family === 4 ? formatIPv4(value) : formatIPv6(value);
}

export function prefixMask(prefix: number, bits: number): bigint {
  requireCondition(
    (bits === 32 || bits === 128) && Number.isInteger(prefix) && prefix >= 0 && prefix <= bits,
    `Prefix must be an integer from 0 to ${bits}.`,
  );
  if (prefix === 0) return 0n;
  return ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
}

export function networkFrom(start: bigint, prefix: number, family: Family): Network {
  requireCondition(family === 4 || family === 6, 'Address family must be 4 or 6.');
  const bits = family === 4 ? 32 : 128;
  requireCondition(
    typeof start === 'bigint' && start >= 0n && start < 1n << BigInt(bits),
    `Address must fit in ${bits} unsigned bits.`,
  );
  const mask = prefixMask(prefix, bits);
  const base = start & mask;
  const size = 1n << BigInt(bits - prefix);
  return {
    family,
    bits,
    address: start,
    start: base,
    end: base + size - 1n,
    prefix,
    size,
    cidr: `${formatIP(base, family)}/${prefix}`,
  };
}

export function parseNetwork(
  input: string,
  requiredFamily?: Family,
  requirePrefix = false,
): Network {
  const text = stringInput(input, 'Network');
  const parts = text.split('/');
  requireCondition(parts.length <= 2, 'Use a single CIDR slash, for example 192.168.1.0/24.');
  requireCondition(
    !requirePrefix || parts.length === 2,
    'Include a CIDR prefix such as /24 or /64.',
  );
  const address = parseIP(parts[0] ?? '', requiredFamily);
  const bits = address.family === 4 ? 32 : 128;
  const rawPrefix = parts[1];
  requireCondition(
    rawPrefix === undefined || /^(0|[1-9]\d{0,2})$/.test(rawPrefix),
    `Prefix must be a whole number from 0 to ${bits}, without leading zeroes.`,
  );
  const prefix = rawPrefix === undefined ? bits : Number(rawPrefix);
  return networkFrom(address.value, prefix, address.family);
}

export function contains(parent: Network, child: Network): boolean {
  return parent.family === child.family && parent.start <= child.start && parent.end >= child.end;
}

export function intersects(left: Interval, right: Interval): boolean {
  return left.start <= right.end && right.start <= left.end;
}

export function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function bitLength(value: bigint): number {
  requireCondition(value >= 0n, 'Bit length requires a nonnegative integer.');
  return value === 0n ? 0 : value.toString(2).length;
}

export function trailingZeroes(value: bigint, bits: number): number {
  if (value === 0n) return bits;
  let count = 0;
  while (count < bits && (value & (1n << BigInt(count))) === 0n) count += 1;
  return count;
}

export function rangeToNetworks(start: bigint, end: bigint, family: Family): Network[] {
  const bits = family === 4 ? 32 : 128;
  requireCondition(
    start >= 0n && end >= start && end < 1n << BigInt(bits),
    'The inclusive range must be ordered and fit within its address family.',
  );
  const result: Network[] = [];
  let cursor = start;
  while (cursor <= end) {
    const exponent = Math.min(trailingZeroes(cursor, bits), bitLength(end - cursor + 1n) - 1);
    const network = networkFrom(cursor, bits - exponent, family);
    result.push(network);
    cursor = network.end + 1n;
  }
  return result;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort(
      (left, right) => compareBigInt(left.start, right.start) || compareBigInt(left.end, right.end),
    );
  const result: Interval[] = [];
  for (const interval of sorted) {
    requireCondition(
      interval.start >= 0n && interval.end >= interval.start,
      'Intervals must be nonnegative inclusive ranges.',
    );
    const last = result[result.length - 1];
    if (last && interval.start <= last.end + 1n) {
      if (interval.end > last.end) last.end = interval.end;
    } else result.push(interval);
  }
  return result;
}

export function subtractIntervals(parent: Interval, exclusions: Interval[]): Interval[] {
  const occupied = mergeIntervals(
    exclusions
      .filter((interval) => intersects(parent, interval))
      .map((interval) => ({
        start: interval.start < parent.start ? parent.start : interval.start,
        end: interval.end > parent.end ? parent.end : interval.end,
      })),
  );
  const result: Interval[] = [];
  let cursor = parent.start;
  for (const interval of occupied) {
    if (cursor < interval.start) result.push({ start: cursor, end: interval.start - 1n });
    cursor = interval.end + 1n;
  }
  if (cursor <= parent.end) result.push({ start: cursor, end: parent.end });
  return result;
}

export function serialNetwork(network: Network): Record<string, string | number> {
  return {
    family: network.family,
    cidr: network.cidr,
    prefix: network.prefix,
    start: formatIP(network.start, network.family),
    end: formatIP(network.end, network.family),
    size: network.size.toString(),
  };
}

export function normalizationWarnings(network: Network): string[] {
  return network.address === network.start
    ? []
    : [`Host bits were cleared to normalize the network to ${network.cidr}.`];
}

export function makeResult(
  toolId: string,
  title: string,
  normalizedInput: Record<string, unknown>,
  summary: ResultField[],
): CalculationResult {
  return {
    toolId,
    title,
    normalizedInput,
    summary,
    steps: [],
    warnings: [],
    engineVersion: ENGINE_VERSION,
  };
}

export function percentage(part: bigint, total: bigint): string {
  if (total === 0n) return '0.00';
  const hundredths = (part * 10000n + total / 2n) / total;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`;
}
