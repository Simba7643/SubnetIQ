import { type CalculationResult } from '@subnetiq/shared';
import {
  bitLength,
  formatIP,
  intersects,
  makeResult,
  mergeIntervals,
  networkFrom,
  normalizationWarnings,
  parseIP,
  parseNetwork,
  PREVIEW_LIMIT,
  rangeToNetworks,
  requireCondition,
  serialNetwork,
  stringInput,
  stringList,
  subtractIntervals,
  type Network,
} from './core.js';

function rangeRows(networks: Network[]) {
  return networks.map((network) => ({
    cidr: network.cidr,
    start: formatIP(network.start, network.family),
    end: formatIP(network.end, network.family),
    size: network.size.toString(),
  }));
}

const rangeColumns = [
  { key: 'cidr', label: 'CIDR' },
  { key: 'start', label: 'First address' },
  { key: 'end', label: 'Last address' },
  { key: 'size', label: 'Addresses' },
];

export function aggregateNetworks(networks: Network[]): Network[] {
  requireCondition(
    networks.length > 0 && networks.length <= 1000,
    'Provide 1 to 1000 CIDR networks.',
  );
  const family = networks[0]!.family;
  requireCondition(
    networks.every((network) => network.family === family),
    'Aggregate IPv4 and IPv6 networks separately.',
  );
  return mergeIntervals(networks).flatMap((interval) =>
    rangeToNetworks(interval.start, interval.end, family),
  );
}

export function calculateAggregate(input: Record<string, unknown>): CalculationResult {
  const networks = stringList(input.networks, 'Networks').map((text) => parseNetwork(text));
  const mode = input.mode ?? 'exact';
  requireCondition(
    mode === 'exact' || mode === 'cover',
    'Aggregation mode must be exact or cover.',
  );
  const exact = aggregateNetworks(networks);
  const first = exact[0]!;
  const last = exact[exact.length - 1]!;
  const prefix = first.bits - bitLength(first.start ^ last.end);
  const covering = networkFrom(first.start, prefix, first.family);
  const resultNetworks = mode === 'exact' ? exact : [covering];
  const exactSize = exact.reduce((sum, network) => sum + network.size, 0n);
  const outputSize = resultNetworks.reduce((sum, network) => sum + network.size, 0n);
  const added = outputSize - exactSize;
  const result = makeResult(
    'aggregate',
    mode === 'exact' ? 'Exact CIDR aggregation' : 'Single covering supernet',
    { networks: networks.map((network) => network.cidr), mode },
    [
      { label: 'Address family', value: `IPv${first.family}` },
      { label: 'Input entries', value: networks.length },
      { label: 'Output CIDRs', value: resultNetworks.length },
      { label: 'Unique input addresses', value: exactSize.toString() },
      { label: 'Output addresses', value: outputSize.toString() },
      { label: 'Additional addresses included', value: added.toString() },
      { label: 'Preserves exact input union', value: added === 0n },
    ],
  );
  result.columns = rangeColumns;
  result.rows = rangeRows(resultNetworks);
  result.blocks = resultNetworks.map((network, index) => ({
    name: `Aggregate ${index + 1}`,
    cidr: network.cidr,
    start: formatIP(network.start, network.family),
    end: formatIP(network.end, network.family),
    size: network.size.toString(),
  }));
  result.steps = [
    {
      title: 'Normalize and sort the input',
      description:
        'Turn each CIDR into an inclusive integer interval, then sort by start address. All networks must use the same address family.',
    },
    {
      title: 'Remove duplicate coverage',
      description:
        'Merge overlapping and adjacent intervals. This counts every original address once and preserves any gaps between disjoint ranges.',
    },
    {
      title: mode === 'exact' ? 'Cover each interval exactly' : 'Find the common prefix',
      description:
        mode === 'exact'
          ? 'Starting at each merged interval base, choose the largest aligned CIDR that stays within the interval. Repeat until the interval is exhausted.'
          : 'Compare the lowest and highest covered addresses. Their shared leading bits define the narrowest single CIDR that contains them both.',
      formula:
        mode === 'exact'
          ? `${exactSize} unique input addresses = ${outputSize} output addresses`
          : `${first.bits} − bitLength(first XOR last) = /${prefix}`,
    },
    {
      title: 'Make excess coverage visible',
      description:
        added === 0n
          ? 'The output covers exactly the original address union.'
          : `The single covering CIDR includes ${added} addresses outside the supplied networks. Review the additional ranges before using it in routing or access rules.`,
      formula: `${outputSize} − ${exactSize} = ${added}`,
    },
  ];
  result.warnings = [...new Set(networks.flatMap(normalizationWarnings))];
  if (added > 0n)
    result.warnings.push(
      `The covering summary includes ${added} additional addresses. It broadens the selected address space.`,
    );
  const addedRanges = mode === 'cover' ? subtractIntervals(covering, exact) : [];
  result.data = {
    mode,
    family: first.family,
    networks: resultNetworks.map((network) => network.cidr),
    exactNetworks: exact.map((network) => network.cidr),
    coveringNetwork: covering.cidr,
    uniqueInputAddresses: exactSize.toString(),
    outputAddresses: outputSize.toString(),
    additionalAddressCount: added.toString(),
    additionalRanges: addedRanges.map((interval) => ({
      start: formatIP(interval.start, first.family),
      end: formatIP(interval.end, first.family),
      size: (interval.end - interval.start + 1n).toString(),
    })),
  };
  result.sources = ['https://www.rfc-editor.org/rfc/rfc4632.html'];
  return result;
}

export function calculateRangeToCidr(input: Record<string, unknown>): CalculationResult {
  const start = parseIP(stringInput(input.start, 'Range start'));
  const end = parseIP(stringInput(input.end, 'Range end'));
  requireCondition(
    start.family === end.family,
    'Range endpoints must use the same address family.',
  );
  requireCondition(
    start.value <= end.value,
    'Range start must be less than or equal to range end.',
  );
  const networks = rangeToNetworks(start.value, end.value, start.family);
  const size = end.value - start.value + 1n;
  const result = makeResult(
    'range-to-cidr',
    'Inclusive range to minimal CIDRs',
    { start: start.text, end: end.text },
    [
      { label: 'Range start', value: start.text },
      { label: 'Range end', value: end.text },
      { label: 'Total addresses', value: size.toString() },
      { label: 'Minimal CIDR count', value: networks.length },
      { label: 'Extra addresses included', value: '0' },
    ],
  );
  result.columns = rangeColumns;
  result.rows = rangeRows(networks);
  result.blocks = networks.map((network, index) => ({
    name: `Block ${index + 1}`,
    cidr: network.cidr,
    start: formatIP(network.start, network.family),
    end: formatIP(network.end, network.family),
    size: network.size.toString(),
  }));
  result.steps = [
    {
      title: 'Use an inclusive interval',
      description:
        'Both endpoints belong to the range. Compare their full unsigned integer values after validating the address family.',
      formula: `${end.value} − ${start.value} + 1 = ${size}`,
    },
    {
      title: 'Choose the largest aligned block',
      description:
        'At the current start, trailing zero bits determine alignment. The remaining interval length limits how large the next power-of-two block can be.',
    },
    {
      title: 'Advance without gaps or overlaps',
      description:
        'Emit that CIDR and move to its last address plus one. Repeat until the inclusive end is reached. This greedy choice yields the minimal exact CIDR cover.',
    },
    {
      title: 'Verify conservation',
      description:
        'Every output block lies inside the input range, adjacent outputs touch without overlapping, and their sizes sum to the inclusive range size.',
      formula: `sum(output sizes) = ${size}`,
    },
  ];
  result.data = {
    family: start.family,
    start: start.text,
    end: end.text,
    totalAddresses: size.toString(),
    networks: networks.map((network) => network.cidr),
  };
  result.sources = ['https://www.rfc-editor.org/rfc/rfc4632.html'];
  return result;
}

export function calculateCidrToRange(input: Record<string, unknown>): CalculationResult {
  const network = parseNetwork(stringInput(input.network, 'CIDR network'), undefined, true);
  const result = makeResult('cidr-to-range', 'CIDR to inclusive range', { network: network.cidr }, [
    { label: 'Network', value: network.cidr },
    { label: 'Range start', value: formatIP(network.start, network.family) },
    { label: 'Range end', value: formatIP(network.end, network.family) },
    { label: 'Total addresses', value: network.size.toString() },
    { label: 'Address family', value: `IPv${network.family}` },
  ]);
  result.columns = rangeColumns;
  result.rows = rangeRows([network]);
  result.steps = [
    {
      title: 'Normalize the base',
      description: `Retain the first ${network.prefix} bits and clear all remaining bits to obtain ${formatIP(network.start, network.family)}.`,
    },
    {
      title: 'Count all address combinations',
      description: 'Each non-prefix bit may be zero or one.',
      formula: `2^(${network.bits} − ${network.prefix}) = ${network.size}`,
    },
    {
      title: 'Find the inclusive last address',
      description:
        'Add one less than the size to the normalized base. The full range includes network and any special-purpose addresses.',
      formula: `${formatIP(network.start, network.family)} + ${network.size - 1n} = ${formatIP(network.end, network.family)}`,
    },
  ];
  result.warnings = normalizationWarnings(network);
  result.data = { ...serialNetwork(network), totalAddresses: network.size.toString() };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc4632.html',
    'https://www.rfc-editor.org/rfc/rfc4291.html',
  ];
  return result;
}

export function calculateOverlap(input: Record<string, unknown>): CalculationResult {
  const raw = stringList(input.networks, 'Networks', 2);
  const networks = raw.map((text) => parseNetwork(text));
  const rows: {
    first: string;
    second: string;
    firstIndex: number;
    secondIndex: number;
    relationship: string;
    intersection: string;
  }[] = [];
  let conflictCount = 0;
  let duplicateCount = 0;
  for (let index = 0; index < networks.length; index += 1) {
    for (let other = index + 1; other < networks.length; other += 1) {
      const first = networks[index]!;
      const second = networks[other]!;
      if (first.family !== second.family || !intersects(first, second)) continue;
      conflictCount += 1;
      const duplicate = first.start === second.start && first.end === second.end;
      if (duplicate) duplicateCount += 1;
      if (rows.length >= PREVIEW_LIMIT) continue;
      const intersection = first.prefix >= second.prefix ? first : second;
      const relationship = duplicate
        ? 'Duplicate'
        : first.start <= second.start && first.end >= second.end
          ? 'First contains second'
          : 'Second contains first';
      rows.push({
        first: first.cidr,
        second: second.cidr,
        firstIndex: index + 1,
        secondIndex: other + 1,
        relationship,
        intersection: intersection.cidr,
      });
    }
  }
  const families = new Set(networks.map((network) => network.family));
  const result = makeResult(
    'overlap',
    'Network overlap and containment check',
    { networks: networks.map((network) => network.cidr) },
    [
      { label: 'Networks checked', value: networks.length },
      { label: 'Conflicting pairs', value: conflictCount },
      { label: 'Duplicate pairs', value: duplicateCount },
      { label: 'Containment pairs', value: conflictCount - duplicateCount },
      { label: 'Conflict-free', value: conflictCount === 0 },
    ],
  );
  result.columns = [
    { key: 'firstIndex', label: 'Entry' },
    { key: 'first', label: 'First network' },
    { key: 'secondIndex', label: 'Entry' },
    { key: 'second', label: 'Second network' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'intersection', label: 'Intersection' },
  ];
  result.rows = rows;
  result.steps = [
    {
      title: 'Normalize the networks',
      description:
        'Convert each input to a canonical CIDR with an inclusive first and last address. Keep input positions so duplicate entries remain identifiable.',
    },
    {
      title: 'Compare within each family',
      description:
        'IPv4 and IPv6 are separate address spaces. For two ranges in one family, an overlap exists when each starts no later than the other ends.',
      formula: 'A.start ≤ B.end AND B.start ≤ A.end',
    },
    {
      title: 'Describe containment',
      description:
        'Equal endpoints identify duplicates. Aligned CIDR intersections imply that one network contains the other. Adjacent non-overlapping ranges are not conflicts.',
    },
    {
      title: 'Preserve address-space context',
      description:
        'Run this check within the intended routing domain. Separate sites or VRFs may intentionally reuse private networks.',
    },
  ];
  result.warnings = [...new Set(networks.flatMap(normalizationWarnings))];
  if (families.size > 1)
    result.warnings.push(
      'IPv4 and IPv6 entries were checked independently; no cross-family overlaps are reported.',
    );
  if (conflictCount > PREVIEW_LIMIT)
    result.warnings.push(
      `There are ${conflictCount} conflicting pairs; this result previews the first ${PREVIEW_LIMIT}.`,
    );
  result.data = {
    conflicts: rows,
    conflictCount,
    duplicateCount,
    containmentCount: conflictCount - duplicateCount,
    truncated: conflictCount > PREVIEW_LIMIT,
    previewCount: rows.length,
    previewLimit: PREVIEW_LIMIT,
    networks: networks.map(serialNetwork),
  };
  result.sources = ['https://www.rfc-editor.org/rfc/rfc4632.html'];
  return result;
}
