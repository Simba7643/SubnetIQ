import { type CalculationResult } from '@subnetiq/shared';
import {
  compareBigInt,
  formatIP,
  intersects,
  makeResult,
  parseIP,
  parseNetwork,
  requireCondition,
  stringInput,
  type Family,
  type Network,
} from './core.js';
import {
  ipv4Registry,
  ipv6Registry,
  REGISTRY_REVIEWED_AT,
  REGISTRY_VERSION,
  type RegistryEntry,
} from './registry.js';

const compiled = [...ipv4Registry, ...ipv6Registry]
  .map((entry) => ({ entry, network: parseNetwork(entry.cidr) }))
  .sort((left, right) => right.network.prefix - left.network.prefix);

function defaultEntry(family: Family): RegistryEntry {
  const isIPv4 = family === 4;
  return {
    cidr: isIPv4 ? '0.0.0.0/0' : '::/0',
    name: isIPv4 ? 'Ordinary IPv4 unicast space' : 'IPv6 space outside listed allocations',
    category: isIPv4 ? 'Public unicast candidate' : 'Reserved or unallocated',
    source: isIPv4 ? true : null,
    destination: isIPv4 ? true : null,
    forwardable: isIPv4 ? true : null,
    globallyReachable: isIPv4 ? true : null,
    reservedByProtocol: null,
    reference: isIPv4 ? 'RFC 791, RFC 6890' : 'RFC 4291',
    family,
    registryVersion: REGISTRY_VERSION,
    reviewedAt: REGISTRY_REVIEWED_AT,
    sourceUrl: `https://www.iana.org/assignments/iana-ipv${family}-special-registry/iana-ipv${family}-special-registry.xhtml`,
    kind: 'fallback',
    notes: isIPv4
      ? 'No matching special-purpose entry was found. This is an address category, not evidence that the address is assigned, announced, reachable, or safe to contact.'
      : 'This snapshot does not establish a global unicast allocation for this address. Consult the current IANA IPv6 unicast assignments for allocation status.',
  };
}

export function classifyAddress(value: bigint, family: Family): RegistryEntry {
  requireCondition(
    (family === 4 || family === 6) &&
      typeof value === 'bigint' &&
      value >= 0n &&
      value < 1n << BigInt(family === 4 ? 32 : 128),
    'Classification requires an unsigned address in a valid IPv4 or IPv6 family.',
  );
  const found = compiled.find(
    (item) =>
      item.network.family === family && item.network.start <= value && item.network.end >= value,
  );
  return { ...(found?.entry ?? defaultEntry(family)) };
}

export interface ClassifiedInterval {
  start: bigint;
  end: bigint;
  classification: RegistryEntry;
}

export function classifyNetwork(network: Network): ClassifiedInterval[] {
  const boundaries = new Set<bigint>([network.start, network.end + 1n]);
  for (const item of compiled) {
    if (item.network.family !== network.family || !intersects(network, item.network)) continue;
    if (item.network.start > network.start) boundaries.add(item.network.start);
    if (item.network.end < network.end) boundaries.add(item.network.end + 1n);
  }
  const sorted = [...boundaries].sort(compareBigInt);
  const result: ClassifiedInterval[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]!;
    const end = sorted[index + 1]! - 1n;
    const classification = classifyAddress(start, network.family);
    const last = result[result.length - 1];
    if (last && last.classification.cidr === classification.cidr && last.end + 1n === start)
      last.end = end;
    else result.push({ start, end, classification });
  }
  return result;
}

export function historicalClass(network: Network): string {
  if (network.family !== 4) return 'Not applicable to IPv6';
  const classify = (value: bigint): string => {
    const octet = Number(value >> 24n);
    return octet < 128
      ? 'A'
      : octet < 192
        ? 'B'
        : octet < 224
          ? 'C'
          : octet < 240
            ? 'D (multicast)'
            : 'E (reserved)';
  };
  const first = classify(network.start);
  return first === classify(network.end)
    ? `Class ${first} (historical)`
    : 'Spans multiple historical classes';
}

export function classificationLabel(network: Network): string {
  const categories = [
    ...new Set(classifyNetwork(network).map((entry) => entry.classification.category)),
  ];
  return categories.length === 1 ? categories[0]! : `Mixed: ${categories.join(', ')}`;
}

export function calculateClassification(input: Record<string, unknown>): CalculationResult {
  const raw = stringInput(input.address, 'Address or network');
  const network = parseNetwork(raw);
  const intervals = classifyNetwork(network);
  const mixed = new Set(intervals.map((item) => item.classification.cidr)).size > 1;
  const first = intervals[0]!.classification;
  const sameFlag = (
    key: 'source' | 'destination' | 'forwardable' | 'globallyReachable' | 'reservedByProtocol',
  ): string | boolean => {
    const values = new Set(intervals.map((item) => item.classification[key]));
    return values.size > 1 ? 'Mixed' : (first[key] ?? 'Context-dependent / unspecified');
  };
  const result = makeResult(
    'classify',
    'IP address classification',
    { address: raw.includes('/') ? network.cidr : formatIP(network.address, network.family) },
    [
      { label: 'Address family', value: `IPv${network.family}` },
      {
        label: 'Range',
        value: `${formatIP(network.start, network.family)} – ${formatIP(network.end, network.family)}`,
      },
      { label: 'Classification', value: classificationLabel(network) },
      {
        label: 'Longest matching prefix',
        value: mixed
          ? 'Multiple entries in range'
          : first.kind === 'fallback'
            ? 'No special-purpose match'
            : first.cidr,
      },
      { label: 'Valid source', value: sameFlag('source') },
      { label: 'Valid destination', value: sameFlag('destination') },
      { label: 'Forwardable', value: sameFlag('forwardable') },
      { label: 'Globally reachable flag', value: sameFlag('globallyReachable') },
      { label: 'Reserved by protocol', value: sameFlag('reservedByProtocol') },
      { label: 'Registry snapshot', value: REGISTRY_VERSION },
    ],
  );
  if (network.family === 4)
    result.summary.push({ label: 'Historical class', value: historicalClass(network) });
  if (network.family === 6 && network.prefix === 128 && network.address >> 120n === 255n) {
    const scope = Number((network.address >> 112n) & 15n);
    const scopes: Record<number, string> = {
      0: 'Reserved',
      1: 'Interface-local',
      2: 'Link-local',
      3: 'Realm-local',
      4: 'Admin-local',
      5: 'Site-local',
      8: 'Organization-local',
      14: 'Global',
      15: 'Reserved',
    };
    result.summary.push({
      label: 'Multicast scope',
      value: `${scope}: ${scopes[scope] ?? 'Unassigned scope'}`,
    });
  }
  result.columns = [
    { key: 'start', label: 'Range start' },
    { key: 'end', label: 'Range end' },
    { key: 'category', label: 'Purpose' },
    { key: 'cidr', label: 'Matching entry' },
    { key: 'source', label: 'Source' },
    { key: 'destination', label: 'Destination' },
    { key: 'forwardable', label: 'Forwardable' },
    { key: 'globallyReachable', label: 'Global' },
  ];
  result.rows = intervals.map((item) => ({
    start: formatIP(item.start, network.family),
    end: formatIP(item.end, network.family),
    category: item.classification.category,
    cidr: item.classification.cidr,
    source: item.classification.source,
    destination: item.classification.destination,
    forwardable: item.classification.forwardable,
    globallyReachable: item.classification.globallyReachable,
  }));
  result.data = {
    family: network.family,
    mixed,
    classification: mixed ? null : first,
    intervals: intervals.map((item) => ({
      start: formatIP(item.start, network.family),
      end: formatIP(item.end, network.family),
      size: (item.end - item.start + 1n).toString(),
      classification: item.classification,
    })),
    registryVersion: REGISTRY_VERSION,
    reviewedAt: REGISTRY_REVIEWED_AT,
  };
  result.steps = [
    {
      title: 'Normalize the address range',
      description: `Interpret ${raw} as ${network.cidr}; clear any host bits when a CIDR prefix is supplied.`,
    },
    {
      title: 'Apply the most specific entry',
      description:
        'For each address, prefer the matching entry with the longest prefix. A more specific anycast or translation assignment overrides its broader parent reservation.',
    },
    {
      title: 'Inspect the whole range',
      description: `Partition at registry boundaries and evaluate all ${intervals.length} resulting range${intervals.length === 1 ? '' : 's'}. Matching only the first address would miss mixed-purpose space.`,
    },
    {
      title: 'Keep the registry flags separate',
      description:
        'Source validity, destination validity, forwardability, and global reachability describe different properties. A global flag does not prove a route exists or that the address is assigned.',
    },
  ];
  result.warnings = [
    'Classification uses a bundled, versioned registry snapshot; it does not perform a live route, allocation, or connectivity check.',
  ];
  result.sources = [...new Set(intervals.map((item) => item.classification.sourceUrl))];
  return result;
}

export function isGlobalUnicast(input: string): boolean {
  const address = parseIP(input);
  const item = classifyAddress(address.value, address.family);
  return (
    item.globallyReachable === true &&
    item.source === true &&
    item.destination === true &&
    item.category !== 'Multicast'
  );
}
