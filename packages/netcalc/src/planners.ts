import {
  type AllocationBlock,
  type CalculationResult,
  type NetworkPolicy,
  type SegmentInput,
} from '@subnetiq/shared';
import {
  compareBigInt,
  contains,
  decimalBigInt,
  decimalInput,
  formatIP,
  formatIPv4,
  formatIPv6,
  integerInput,
  intersects,
  makeResult,
  mergeIntervals,
  networkFrom,
  normalizationWarnings,
  parseNetwork,
  percentage,
  PREVIEW_LIMIT,
  rangeToNetworks,
  requireCondition,
  serialNetwork,
  stringInput,
  stringList,
  subtractIntervals,
  type Interval,
  type Network,
} from './core.js';
import {
  capacity,
  policyNames,
  policySources,
  readPolicy,
  readVariant,
  smallestPrefix,
  type CloudVariant,
} from './policies.js';

const colors = [
  '#28c7b7',
  '#63a9ff',
  '#ae8aff',
  '#f3b65b',
  '#f078a5',
  '#7bc97d',
  '#6dc9e8',
  '#e89466',
];

function allocation(network: Network, name: string, index: number): AllocationBlock {
  return {
    name,
    cidr: network.cidr,
    start: formatIP(network.start, network.family),
    end: formatIP(network.end, network.family),
    size: network.size.toString(),
    color: colors[index % colors.length],
  };
}

export function calculateIPv4Split(input: Record<string, unknown>): CalculationResult {
  const parent = parseNetwork(stringInput(input.network, 'Parent IPv4 network'), 4, true);
  const hasPrefix = input.prefix !== undefined && input.prefix !== '';
  let prefix: number;
  let count: number;
  if (hasPrefix) {
    prefix = integerInput(input.prefix, 'Child prefix', parent.prefix, 32);
    const available = 2 ** (prefix - parent.prefix);
    count = integerInput(input.count, 'Subnet count', 1, available, available);
  } else {
    count = integerInput(input.count, 'Subnet count', 1, 4294967296, 2);
    const countBig = BigInt(count);
    requireCondition(
      (countBig & (countBig - 1n)) === 0n,
      'Equal splitting requires a power-of-two count such as 2, 4, 8, or 16. To allocate an arbitrary count, supply an explicit child prefix.',
    );
    prefix = parent.prefix + Math.log2(count);
    requireCondition(
      prefix <= 32,
      'There are not enough IPv4 addresses for that many child subnets.',
    );
  }
  const startIndex = decimalBigInt(input.startIndex, 'Starting subnet index');
  requireCondition(
    startIndex < BigInt(count),
    `Starting index must be less than the allocated subnet count (${count}).`,
  );
  const size = 1n << BigInt(32 - prefix);
  const totalSubnets = 1n << BigInt(prefix - parent.prefix);
  const shown = Number(
    BigInt(count) - startIndex < BigInt(PREVIEW_LIMIT)
      ? BigInt(count) - startIndex
      : BigInt(PREVIEW_LIMIT),
  );
  const networks = Array.from({ length: shown }, (_, index) =>
    networkFrom(parent.start + (startIndex + BigInt(index)) * size, prefix, 4),
  );
  const allocatedSize = BigInt(count) * size;
  const result = makeResult(
    'ipv4-split',
    'IPv4 equal subnet allocation',
    { network: parent.cidr, prefix, count, startIndex: startIndex.toString() },
    [
      { label: 'Parent network', value: parent.cidr },
      { label: 'Child prefix', value: `/${prefix}` },
      { label: 'Allocated subnet count', value: String(count) },
      { label: 'Possible subnet positions', value: totalSubnets.toString() },
      { label: 'Addresses per subnet', value: size.toString() },
      { label: 'Unallocated addresses', value: (parent.size - allocatedSize).toString() },
      { label: 'Borrowed bits', value: prefix - parent.prefix },
      {
        label: 'Preview',
        value: `${startIndex}–${startIndex + BigInt(shown) - 1n} of ${count} (zero-based)`,
      },
    ],
  );
  result.columns = [
    { key: 'index', label: 'Index' },
    { key: 'cidr', label: 'Subnet' },
    { key: 'start', label: 'First address' },
    { key: 'end', label: 'Last address' },
    { key: 'size', label: 'Addresses' },
    { key: 'lanHosts', label: 'LAN hosts' },
  ];
  result.rows = networks.map((network, index) => ({
    index: (startIndex + BigInt(index)).toString(),
    cidr: network.cidr,
    start: formatIPv4(network.start),
    end: formatIPv4(network.end),
    size: network.size.toString(),
    lanHosts: capacity(network, 'lan').count.toString(),
  }));
  result.blocks = networks.map((network, index) =>
    allocation(network, `Subnet ${startIndex + BigInt(index) + 1n}`, index),
  );
  result.steps = [
    {
      title: 'Choose the child boundary',
      description: `Moving from /${parent.prefix} to /${prefix} borrows ${prefix - parent.prefix} host bits and creates ${totalSubnets} aligned child positions.`,
      formula: `2^(${prefix} − ${parent.prefix}) = ${totalSubnets}`,
    },
    {
      title: 'Calculate the block stride',
      description:
        'Every child has an equal power-of-two size and starts at a multiple of that size.',
      formula: `2^(32 − ${prefix}) = ${size}`,
    },
    {
      title: 'Allocate the requested positions',
      description: `Use the first ${count} aligned positions. ${BigInt(count) === totalSubnets ? 'They exactly partition the parent.' : `The remaining ${totalSubnets - BigInt(count)} positions remain unallocated.`}`,
      formula: `parent base + index × ${size}`,
    },
    {
      title: 'Show a bounded window',
      description: `This result shows ${shown} child rows beginning at index ${startIndex}. Counts and the allocated range remain exact even when every child is not materialized.`,
    },
  ];
  result.warnings = normalizationWarnings(parent);
  if (startIndex > 0n || shown < count)
    result.warnings.push(
      `This is a ${shown}-row preview. JSON contains a compact allocation description; exports of the table contain only the displayed window.`,
    );
  if (prefix === 31)
    result.warnings.push(
      '/31 children have two endpoints with RFC 3021 point-to-point policy; conventional LAN capacity is zero.',
    );
  result.data = {
    parent: serialNetwork(parent),
    childPrefix: prefix,
    totalSubnets: totalSubnets.toString(),
    allocatedSubnets: String(count),
    childSize: size.toString(),
    startIndex: startIndex.toString(),
    previewCount: shown,
    previewLimit: PREVIEW_LIMIT,
    truncated: startIndex > 0n || shown < count,
    allocatedRange: {
      start: formatIPv4(parent.start),
      end: formatIPv4(parent.start + allocatedSize - 1n),
      size: allocatedSize.toString(),
    },
    unallocated:
      parent.size > allocatedSize
        ? rangeToNetworks(parent.start + allocatedSize, parent.end, 4).map(serialNetwork)
        : [],
  };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc4632.html',
    'https://www.rfc-editor.org/rfc/rfc3021.html',
  ];
  return result;
}

interface ParsedSegment extends SegmentInput {
  index: number;
  required: bigint;
  policy: NetworkPolicy;
  cloudVariant: CloudVariant;
  network?: Network;
}

function growthRequirement(hosts: number, growth: number): bigint {
  requireCondition(
    Math.abs(growth * 100 - Math.round(growth * 100)) < 0.0000001,
    'Growth percentage supports at most two decimal places.',
  );
  const basisPoints = BigInt(Math.round(growth * 100));
  return (BigInt(hosts) * (10000n + basisPoints) + 9999n) / 10000n;
}

export function calculateVLSM(input: Record<string, unknown>): CalculationResult {
  const parent = parseNetwork(stringInput(input.network, 'Parent IPv4 network'), 4, true);
  const defaultPolicy = readPolicy(input.policy);
  requireCondition(
    Array.isArray(input.segments) && input.segments.length > 0 && input.segments.length <= 256,
    'Provide 1 to 256 named segments.',
  );
  const names = new Set<string>();
  const segments: ParsedSegment[] = input.segments.map((raw: unknown, index: number) => {
    requireCondition(
      typeof raw === 'object' && raw !== null && !Array.isArray(raw),
      `Segment ${index + 1} must have a name and required host count.`,
    );
    const entry = raw as Record<string, unknown>;
    const name = stringInput(entry.name, `Segment ${index + 1} name`);
    requireCondition(name.length <= 100, 'Segment names must have at most 100 characters.');
    requireCondition(
      !names.has(name.toLowerCase()),
      `Segment name "${name}" is duplicated; use unique names.`,
    );
    names.add(name.toLowerCase());
    const hosts = integerInput(entry.hosts, `${name} host count`, 1, 4294967296);
    const growthPercent = decimalInput(
      entry.growthPercent,
      `${name} growth percentage`,
      0,
      1000,
      0,
    );
    const required = growthRequirement(hosts, growthPercent);
    const policy = readPolicy(entry.policy, defaultPolicy);
    const cloudVariant = readVariant(entry.cloudVariant, policy);
    const lockedCidr =
      entry.lockedCidr === undefined || entry.lockedCidr === ''
        ? undefined
        : stringInput(entry.lockedCidr, `${name} locked CIDR`);
    const segment: ParsedSegment = {
      index,
      name,
      hosts,
      growthPercent,
      required,
      policy,
      cloudVariant,
      lockedCidr,
    };
    if (lockedCidr) {
      const network = parseNetwork(lockedCidr, 4, true);
      requireCondition(
        network.address === network.start,
        `${name}: the locked CIDR must be aligned. Use ${network.cidr}.`,
      );
      requireCondition(
        contains(parent, network),
        `${name}: locked CIDR ${network.cidr} lies outside ${parent.cidr}.`,
      );
      const available = capacity(network, policy, cloudVariant);
      requireCondition(
        available.supported,
        `${name}: the locked CIDR is outside the supported ${policyNames[policy]} prefix range.`,
      );
      requireCondition(
        available.count >= required,
        `${name}: locked CIDR ${network.cidr} holds ${available.count} hosts, but ${required} are needed after growth.`,
      );
      segment.network = network;
    }
    return segment;
  });
  const reservedInput =
    input.reserved === undefined ? [] : stringList(input.reserved, 'Reserved CIDRs', 0, 256);
  const reservedNetworks = reservedInput.map((text) => {
    const network = parseNetwork(text, 4, true);
    requireCondition(
      network.address === network.start,
      `Reserved CIDR ${text} is not aligned; use ${network.cidr}.`,
    );
    requireCondition(
      contains(parent, network),
      `Reserved CIDR ${network.cidr} lies outside ${parent.cidr}.`,
    );
    return network;
  });
  const mergedReserved = mergeIntervals(reservedNetworks);
  const occupied: Interval[] = [...mergedReserved];
  for (const segment of segments.filter((entry) => entry.network)) {
    const network = segment.network!;
    requireCondition(
      !occupied.some((interval) => intersects(interval, network)),
      `${segment.name}: locked allocation ${network.cidr} overlaps another locked allocation or reservation.`,
    );
    occupied.push(network);
  }
  const unlocked = segments
    .filter((segment) => !segment.network)
    .map((segment) => ({
      segment,
      prefix: smallestPrefix(segment.required, segment.policy, segment.cloudVariant),
    }))
    .sort((left, right) => left.prefix - right.prefix || left.segment.index - right.segment.index);
  for (const { segment, prefix } of unlocked) {
    requireCondition(
      prefix >= parent.prefix,
      `${segment.name} needs /${prefix}, which is larger than the parent ${parent.cidr}.`,
    );
    const size = 1n << BigInt(32 - prefix);
    const holes = subtractIntervals(parent, occupied);
    let chosen: Network | undefined;
    for (const hole of holes) {
      const aligned = ((hole.start + size - 1n) / size) * size;
      if (aligned + size - 1n <= hole.end) {
        chosen = networkFrom(aligned, prefix, 4);
        break;
      }
    }
    requireCondition(
      chosen,
      `${segment.name} needs an aligned /${prefix} block (${size} addresses), but none remains in ${parent.cidr}. Reduce growth or hosts, enlarge the parent, or revise locks and reservations.`,
    );
    segment.network = chosen;
    occupied.push(chosen);
  }
  const free = subtractIntervals(parent, occupied);
  const freeNetworks = free.flatMap((interval) => rangeToNetworks(interval.start, interval.end, 4));
  const freeSize = free.reduce((sum, interval) => sum + interval.end - interval.start + 1n, 0n);
  const reservedSize = mergedReserved.reduce(
    (sum, interval) => sum + interval.end - interval.start + 1n,
    0n,
  );
  const allocatedSize = segments.reduce((sum, segment) => sum + segment.network!.size, 0n);
  const hostCount = segments.reduce((sum, segment) => sum + BigInt(segment.hosts), 0n);
  const requiredCount = segments.reduce((sum, segment) => sum + segment.required, 0n);
  const capacities = segments.map((segment) =>
    capacity(segment.network!, segment.policy, segment.cloudVariant),
  );
  const usableTotal = capacities.reduce((sum, entry) => sum + entry.count, 0n);
  const normalizedSegments = segments.map((segment) => ({
    name: segment.name,
    hosts: segment.hosts,
    growthPercent: segment.growthPercent ?? 0,
    policy: segment.policy,
    cloudVariant: segment.cloudVariant,
    ...(segment.lockedCidr ? { lockedCidr: segment.network!.cidr } : {}),
  }));
  const result = makeResult(
    'vlsm',
    'VLSM address plan',
    {
      network: parent.cidr,
      policy: defaultPolicy,
      segments: normalizedSegments,
      reserved: reservedNetworks.map((network) => network.cidr),
    },
    [
      { label: 'Parent network', value: parent.cidr },
      { label: 'Segments', value: segments.length },
      { label: 'Requested hosts', value: hostCount.toString() },
      { label: 'Hosts with growth', value: requiredCount.toString() },
      { label: 'Available segment capacity', value: usableTotal.toString() },
      { label: 'Allocated addresses', value: allocatedSize.toString() },
      { label: 'Explicit reservations', value: reservedSize.toString() },
      { label: 'Unallocated addresses', value: freeSize.toString() },
      {
        label: 'Parent space occupied',
        value: `${percentage(allocatedSize + reservedSize, parent.size)}%`,
      },
      { label: 'Requested host utilization', value: `${percentage(hostCount, usableTotal)}%` },
    ],
  );
  result.columns = [
    { key: 'name', label: 'Segment' },
    { key: 'hosts', label: 'Hosts' },
    { key: 'required', label: 'With growth' },
    { key: 'cidr', label: 'Allocation' },
    { key: 'first', label: 'First usable' },
    { key: 'last', label: 'Last usable' },
    { key: 'capacity', label: 'Capacity' },
    { key: 'policy', label: 'Policy' },
    { key: 'locked', label: 'Locked' },
  ];
  result.rows = segments.map((segment, index) => {
    const available = capacities[index]!;
    return {
      name: segment.name,
      hosts: segment.hosts,
      required: segment.required.toString(),
      cidr: segment.network!.cidr,
      first: available.first === null ? 'Not applicable' : formatIPv4(available.first),
      last: available.last === null ? 'Not applicable' : formatIPv4(available.last),
      capacity: available.count.toString(),
      policy: segment.policy,
      locked: Boolean(segment.lockedCidr),
    };
  });
  const blocks = segments.map((segment, index) => ({
    ...allocation(segment.network!, segment.name, index),
    requested: segment.hosts,
    capacity: capacities[index]!.count.toString(),
    locked: Boolean(segment.lockedCidr),
  }));
  const reservedBlocks = mergedReserved
    .flatMap((interval) => rangeToNetworks(interval.start, interval.end, 4))
    .map((network, index) => ({
      ...allocation(network, `Reserved ${index + 1}`, 0),
      color: '#748397',
      locked: true,
    }));
  result.blocks = [...blocks, ...reservedBlocks].sort((left, right) =>
    compareBigInt(parseNetwork(left.cidr).start, parseNetwork(right.cidr).start),
  );
  result.steps = [
    {
      title: 'Reserve fixed address space',
      description: `Normalize ${parent.cidr}, merge overlapping explicit reservations, and preserve ${segments.filter((segment) => segment.lockedCidr).length} locked allocations. All locks must fit the parent and their grown host requirements.`,
    },
    {
      title: 'Account for growth and policy',
      description:
        'Round required hosts upward after applying the growth percentage. Find the smallest supported power-of-two block whose usable capacity meets that number.',
      formula: 'required = ceil(hosts × (1 + growthPercent / 100))',
    },
    {
      title: 'Allocate the largest blocks first',
      description:
        'Sort unlocked segments by block size descending, retaining input order for ties. Place each in the first suitably aligned free interval while keeping locked blocks fixed.',
    },
    ...segments.map((segment) => ({
      title: `Allocate ${segment.name}`,
      description: `${segment.hosts} requested hosts become ${segment.required} after ${segment.growthPercent ?? 0}% growth. ${segment.network!.cidr} provides ${capacity(segment.network!, segment.policy, segment.cloudVariant).count} under ${policyNames[segment.policy]}${segment.lockedCidr ? '; the existing location remains locked' : ''}.`,
      formula: `${segment.network!.size} total addresses in /${segment.network!.prefix}`,
    })),
    {
      title: 'Reconcile all addresses',
      description:
        'Allocated blocks, explicit reservations, and unallocated intervals are disjoint and together exactly cover the parent.',
      formula: `${allocatedSize} + ${reservedSize} + ${freeSize} = ${parent.size}`,
    },
  ];
  result.warnings = normalizationWarnings(parent);
  result.warnings.push(
    'Allocation is deterministic largest-first aligned placement. Locks and exclusions can create fragmentation; this planner does not claim a proof of global design optimality.',
  );
  result.data = {
    parent: serialNetwork(parent),
    allocations: segments.map((segment, index) => ({
      name: segment.name,
      ...serialNetwork(segment.network!),
      hosts: segment.hosts,
      required: segment.required.toString(),
      growthPercent: segment.growthPercent ?? 0,
      policy: segment.policy,
      cloudVariant: segment.cloudVariant,
      capacity: capacities[index]!.count.toString(),
      locked: Boolean(segment.lockedCidr),
    })),
    reserved: mergedReserved.map((interval) => ({
      start: formatIPv4(interval.start),
      end: formatIPv4(interval.end),
      size: (interval.end - interval.start + 1n).toString(),
    })),
    unallocated: freeNetworks.map(serialNetwork),
    allocatedAddresses: allocatedSize.toString(),
    reservedAddresses: reservedSize.toString(),
    freeAddresses: freeSize.toString(),
    requestedHosts: hostCount.toString(),
    grownHosts: requiredCount.toString(),
    usableCapacity: usableTotal.toString(),
  };
  result.sources = [...new Set(segments.map((segment) => policySources[segment.policy]))];
  return result;
}

export function calculateIPv6Plan(input: Record<string, unknown>): CalculationResult {
  const parent = parseNetwork(stringInput(input.network, 'Parent IPv6 network'), 6, true);
  const prefix = integerInput(
    input.prefix,
    'Child prefix',
    parent.prefix,
    128,
    Math.max(64, parent.prefix),
  );
  const count = integerInput(input.count, 'Preview row count', 1, PREVIEW_LIMIT, 16);
  const startIndex = decimalBigInt(input.startIndex, 'Starting subnet index');
  const total = 1n << BigInt(prefix - parent.prefix);
  requireCondition(startIndex < total, `Starting index must be less than ${total}.`);
  const requested = total - startIndex < BigInt(count) ? Number(total - startIndex) : count;
  const size = 1n << BigInt(128 - prefix);
  const networks = Array.from({ length: requested }, (_, index) =>
    networkFrom(parent.start + (startIndex + BigInt(index)) * size, prefix, 6),
  );
  const reservations =
    input.reserved === undefined
      ? []
      : stringList(input.reserved, 'Reserved IPv6 CIDRs', 0, 256).map((text) => {
          const network = parseNetwork(text, 6, true);
          requireCondition(
            network.address === network.start,
            `Reserved IPv6 CIDR ${text} is not aligned; use ${network.cidr}.`,
          );
          requireCondition(
            contains(parent, network),
            `Reserved IPv6 CIDR ${network.cidr} lies outside ${parent.cidr}.`,
          );
          return network;
        });
  const reserved = mergeIntervals(reservations);
  const excludedIndices = mergeIntervals(
    reserved.map((interval) => ({
      start: (interval.start - parent.start) / size,
      end: (interval.end - parent.start) / size,
    })),
  );
  const reservedChildCount = excludedIndices.reduce(
    (sum, interval) => sum + interval.end - interval.start + 1n,
    0n,
  );
  const reservedAddresses = reserved.reduce(
    (sum, interval) => sum + interval.end - interval.start + 1n,
    0n,
  );
  const freeChildRanges = subtractIntervals({ start: 0n, end: total - 1n }, excludedIndices);
  const statuses = networks.map((network) => {
    const reservedCount = reserved
      .filter((interval) => intersects(interval, network))
      .reduce(
        (sum, interval) =>
          sum +
          (interval.end > network.end ? network.end : interval.end) -
          (interval.start < network.start ? network.start : interval.start) +
          1n,
        0n,
      );
    return {
      cidr: network.cidr,
      status:
        reservedCount === 0n
          ? 'Available'
          : reservedCount === size
            ? 'Reserved'
            : 'Partially reserved; child unavailable',
      reservedAddresses: reservedCount.toString(),
    };
  });
  const result = makeResult(
    'ipv6-plan',
    'Hierarchical IPv6 address plan',
    {
      network: parent.cidr,
      prefix,
      count,
      startIndex: startIndex.toString(),
      reserved: reservations.map((network) => network.cidr),
    },
    [
      { label: 'Parent network', value: parent.cidr },
      { label: 'Child prefix', value: `/${prefix}` },
      { label: 'Total subnet positions', value: total.toString() },
      { label: 'Addresses per child', value: size.toString() },
      { label: 'Subnet identifier bits', value: prefix - parent.prefix },
      { label: 'Available child positions', value: (total - reservedChildCount).toString() },
      { label: 'Unavailable child positions', value: reservedChildCount.toString() },
      { label: 'Physically reserved addresses', value: reservedAddresses.toString() },
      {
        label: 'Preview window',
        value: `${startIndex}–${startIndex + BigInt(requested) - 1n} (zero-based)`,
      },
      { label: 'Rows shown', value: requested },
    ],
  );
  for (const target of [48, 56, 60, 64])
    if (target >= parent.prefix)
      result.summary.push({
        label: `/${target} positions in parent`,
        value: (1n << BigInt(target - parent.prefix)).toString(),
      });
  result.columns = [
    { key: 'index', label: 'Index' },
    { key: 'subnetId', label: 'Subnet identifier (hex)' },
    { key: 'cidr', label: 'Subnet' },
    { key: 'end', label: 'Last address' },
    { key: 'size', label: 'Addresses' },
    { key: 'status', label: 'Availability' },
    { key: 'reservedAddresses', label: 'Reserved addresses in child' },
  ];
  result.rows = networks.map((network, index) => ({
    index: (startIndex + BigInt(index)).toString(),
    subnetId: `0x${(startIndex + BigInt(index)).toString(16)}`,
    cidr: network.cidr,
    end: formatIPv6(network.end),
    size: network.size.toString(),
    status: statuses[index]!.status,
    reservedAddresses: statuses[index]!.reservedAddresses,
  }));
  result.blocks = networks.map((network, index) => ({
    ...allocation(
      network,
      `Subnet ${startIndex + BigInt(index) + 1n}${statuses[index]!.status === 'Available' ? '' : ` · ${statuses[index]!.status}`}`,
      index,
    ),
    ...(statuses[index]!.status !== 'Available' ? { color: '#748397', locked: true } : {}),
  }));
  result.steps = [
    {
      title: 'Choose a hierarchy boundary',
      description: `A /${parent.prefix} parent split into /${prefix} children uses ${prefix - parent.prefix} additional subnet bits. /48, /56, /60, and /64 boundaries are convenient hexadecimal hierarchy points.`,
      formula: `2^(${prefix} − ${parent.prefix}) = ${total}`,
    },
    {
      title: 'Compute an exact stride',
      description:
        'Use a 128-bit integer to advance by one complete child network. This remains exact for a /0 parent or very large indices.',
      formula: `child base = ${formatIPv6(parent.start)} + index × 2^${128 - prefix}`,
    },
    {
      title: 'Navigate a bounded preview',
      description: `Only ${requested} rows are materialized from index ${startIndex}. The total count, compact description, and bounds describe every child position.`,
    },
    {
      title: 'Keep reservations and unavailable children distinct',
      description: `${reservedAddresses} addresses are explicitly reserved. Any overlap makes a full /${prefix} child unavailable, affecting ${reservedChildCount} child positions. Rows distinguish full reservations from partial overlaps, and indices remain stable.`,
    },
    {
      title: 'Plan address use separately',
      description:
        'The child positions cover the parent mathematically. Attach purpose, VLAN, reservations, and corresponding IPv4 allocations in your project. IPv6 has no broadcast address.',
    },
  ];
  result.warnings = normalizationWarnings(parent);
  if (BigInt(requested) !== total)
    result.warnings.push(
      `The table and tabular exports show a ${requested}-row window from ${total} possible child positions. Use a different starting index to inspect another window.`,
    );
  if (prefix > 64 && prefix !== 127 && prefix !== 128)
    result.warnings.push(
      'The selected prefix is mathematically valid; standard Ethernet SLAAC uses /64 LAN subnets.',
    );
  result.data = {
    parent: serialNetwork(parent),
    childPrefix: prefix,
    childSize: size.toString(),
    totalSubnets: total.toString(),
    startIndex: startIndex.toString(),
    previewCount: requested,
    previewLimit: PREVIEW_LIMIT,
    truncated: BigInt(requested) !== total,
    nextIndex:
      startIndex + BigInt(requested) < total ? (startIndex + BigInt(requested)).toString() : null,
    previousIndex:
      startIndex > 0n
        ? (startIndex >= BigInt(count) ? startIndex - BigInt(count) : 0n).toString()
        : null,
    reserved: reserved.map((interval) => ({
      start: formatIPv6(interval.start),
      end: formatIPv6(interval.end),
      size: (interval.end - interval.start + 1n).toString(),
    })),
    reservedAddresses: reservedAddresses.toString(),
    reservedChildCount: reservedChildCount.toString(),
    availableChildCount: (total - reservedChildCount).toString(),
    unavailableChildAddresses: (reservedChildCount * size).toString(),
    blockStatuses: statuses,
    freeChildRanges: freeChildRanges.map((interval) => ({
      startIndex: interval.start.toString(),
      endIndex: interval.end.toString(),
      count: (interval.end - interval.start + 1n).toString(),
    })),
    allocationDescription: `Every /${prefix} child at index i begins at ${formatIPv6(parent.start)} + i × ${size}, for 0 ≤ i < ${total}. Any overlap with an explicit reservation makes that child unavailable.`,
  };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc4291.html',
    'https://www.rfc-editor.org/rfc/rfc6177.html',
  ];
  return result;
}
