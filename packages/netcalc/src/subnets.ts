import { type CalculationResult } from '@subnetiq/shared';
import { classificationLabel, classifyAddress, historicalClass } from './classification.js';
import {
  contains,
  expandIPv6,
  formatIPv4,
  formatIPv6,
  integerInput,
  makeResult,
  MAX4,
  normalizationWarnings,
  parseNetwork,
  prefixMask,
  requireCondition,
  serialNetwork,
  stringInput,
} from './core.js';
import { capacity, policyNames, policySources, readPolicy, readVariant } from './policies.js';

function binaryIPv4(value: bigint): string {
  return formatIPv4(value)
    .split('.')
    .map((octet) => Number(octet).toString(2).padStart(8, '0'))
    .join('.');
}

export function calculateIPv4Subnet(input: Record<string, unknown>): CalculationResult {
  const network = parseNetwork(stringInput(input.address, 'IPv4 address with prefix'), 4);
  const address = formatIPv4(network.address);
  const policy = readPolicy(input.policy);
  const variant = readVariant(input.cloudVariant, policy);
  const available = capacity(network, policy, variant);
  const maskValue = prefixMask(network.prefix, 32);
  const mask = formatIPv4(maskValue);
  const wildcard = formatIPv4(MAX4 ^ maskValue);
  const first = available.first === null ? null : formatIPv4(available.first);
  const last = available.last === null ? null : formatIPv4(available.last);
  const cloud = policy === 'aws' || policy === 'azure' || policy === 'gcp';
  const broadcast =
    network.prefix === 32 || (network.prefix === 31 && policy === 'point-to-point') || cloud
      ? null
      : formatIPv4(network.end);
  const previous =
    network.start >= network.size
      ? `${formatIPv4(network.start - network.size)}/${network.prefix}`
      : null;
  const next = network.end < MAX4 ? `${formatIPv4(network.end + 1n)}/${network.prefix}` : null;
  const parent =
    input.parent === undefined || input.parent === ''
      ? null
      : parseNetwork(stringInput(input.parent, 'Parent CIDR'), 4, true);
  if (parent)
    requireCondition(
      contains(parent, network),
      'The subnet must be contained by the supplied parent network.',
    );
  const normalizedInput: Record<string, unknown> = {
    address: `${address}/${network.prefix}`,
    policy,
    cloudVariant: variant,
  };
  if (parent) normalizedInput.parent = parent.cidr;
  const result = makeResult('ipv4-subnet', 'IPv4 subnet calculation', normalizedInput, [
    { label: 'Network', value: network.cidr },
    { label: 'Subnet mask', value: mask },
    { label: 'Wildcard mask', value: wildcard },
    {
      label: 'Total addresses',
      value: network.size.toString(),
      description: 'The mathematical size of the inclusive address range.',
    },
    {
      label: 'Usable under policy',
      value: available.count.toString(),
      description: available.description,
    },
    { label: 'First usable address', value: first ?? 'Not applicable' },
    { label: 'Last usable address', value: last ?? 'Not applicable' },
    {
      label: 'Broadcast',
      value: broadcast ?? (cloud ? `Not supported by ${policyNames[policy]}` : 'Not applicable'),
    },
    { label: 'Full range', value: `${formatIPv4(network.start)} – ${formatIPv4(network.end)}` },
    {
      label: 'Policy',
      value: `${policyNames[policy]}${variant === 'standard' ? '' : ` (${variant})`}`,
    },
    { label: 'Policy supported', value: available.supported },
    { label: 'Reserved under policy', value: available.reserved.toString() },
    { label: 'Classification', value: classificationLabel(network) },
    { label: 'Historical class', value: historicalClass(network) },
    { label: 'Network bits', value: network.prefix },
    { label: 'Host bits', value: 32 - network.prefix },
    { label: 'Previous subnet', value: previous ?? 'Outside IPv4 address space' },
    { label: 'Next subnet', value: next ?? 'Outside IPv4 address space' },
    { label: 'IP binary', value: binaryIPv4(network.address) },
    { label: 'Mask binary', value: binaryIPv4(maskValue) },
    { label: 'Network binary', value: binaryIPv4(network.start) },
    { label: 'IP hexadecimal', value: `0x${network.address.toString(16).padStart(8, '0')}` },
  ]);
  if (parent)
    result.summary.push(
      { label: 'Borrowed bits', value: network.prefix - parent.prefix },
      {
        label: 'Equal children of parent',
        value: (1n << BigInt(network.prefix - parent.prefix)).toString(),
      },
    );
  const octetIndex = network.prefix === 0 ? 0 : Math.ceil(network.prefix / 8) - 1;
  const octetMask = Number(mask.split('.')[octetIndex]);
  const magicNumber = 256 - octetMask;
  result.steps = [
    {
      title: 'Separate network and host bits',
      description: `An IPv4 address has 32 bits. /${network.prefix} keeps ${network.prefix} network bits and leaves ${32 - network.prefix} host bits.`,
      formula: `32 − ${network.prefix} = ${32 - network.prefix}`,
    },
    {
      title: 'Build the subnet mask',
      description: `Write ${network.prefix} one bits followed by ${32 - network.prefix} zero bits. Group the bits into four octets to obtain ${mask}.`,
      formula: binaryIPv4(maskValue),
    },
    {
      title: 'AND the address with the mask',
      description:
        'A one bit in the mask keeps the corresponding address bit; a zero bit clears it.',
      formula: `${binaryIPv4(network.address)} AND ${binaryIPv4(maskValue)} = ${binaryIPv4(network.start)}`,
    },
    {
      title: 'Find the block size',
      description: `Each host bit doubles the mathematical address count. The inclusive final address is the network base plus the count minus one.`,
      formula: `2^${32 - network.prefix} = ${network.size}; ${formatIPv4(network.start)} + ${network.size - 1n} = ${formatIPv4(network.end)}`,
    },
    {
      title: 'Check the magic number',
      description: `In octet ${octetIndex + 1}, subtract its mask value from 256. Boundaries advance by ${magicNumber} at that octet; complete lower octets belong to the block.`,
      formula: `256 − ${octetMask} = ${magicNumber}`,
    },
    {
      title: 'Apply the allocation policy',
      description: available.description,
      formula: `${network.size} − ${available.reserved} = ${available.count}`,
    },
    {
      title: 'Borrow bits only relative to a parent',
      description: parent
        ? `The parent ${parent.cidr} has ${parent.prefix} network bits; this child borrows ${network.prefix - parent.prefix} additional bits, creating ${1n << BigInt(network.prefix - parent.prefix)} equal child positions.`
        : 'A parent prefix was not supplied, so no classful parent or borrowed-bit count is assumed. Add a parent network to calculate that relationship.',
    },
  ];
  result.warnings = [...normalizationWarnings(network), ...available.warnings];
  if (network.prefix === 0)
    result.warnings.push(
      'A /0 spans the complete IPv4 address space, including many special-purpose ranges. Its arithmetic host count is not an assignable-network plan.',
    );
  if (cloud)
    result.warnings.push(
      'The provider profile models address reservations and prefix limits; service-specific exclusions, BYOIP rules, routing constraints, and address ownership must also be satisfied.',
    );
  result.blocks = [
    {
      name: 'Network',
      cidr: network.cidr,
      start: formatIPv4(network.start),
      end: formatIPv4(network.end),
      size: network.size.toString(),
      capacity: available.count.toString(),
    },
  ];
  result.data = {
    network: network.cidr,
    networkAddress: formatIPv4(network.start),
    address,
    prefix: network.prefix,
    mask,
    wildcard,
    broadcast,
    firstUsable: first,
    lastUsable: last,
    totalAddresses: network.size.toString(),
    usableHosts: available.count.toString(),
    reserved: available.reserved.toString(),
    policySupported: available.supported,
    policyProfileVersion: cloud ? '2026-10-04' : null,
    parent: serialNetwork(network),
    previous,
    next,
    classification: classifyAddress(network.address, 4),
    binary: {
      address: binaryIPv4(network.address),
      mask: binaryIPv4(maskValue),
      network: binaryIPv4(network.start),
    },
  };
  result.sources = [policySources[policy], 'https://www.rfc-editor.org/rfc/rfc4632.html'];
  return result;
}

export function calculateNetmaskTable(input: Record<string, unknown>): CalculationResult {
  const min = integerInput(input.min, 'Minimum prefix', 0, 32, 0);
  const max = integerInput(input.max, 'Maximum prefix', min, 32, 32);
  const policy = readPolicy(input.policy);
  const variant = readVariant(input.cloudVariant, policy);
  const result = makeResult(
    'netmask-table',
    'IPv4 netmask lookup table',
    { min, max, policy, cloudVariant: variant },
    [
      { label: 'Prefix range', value: `/${min} to /${max}` },
      { label: 'Allocation policy', value: policyNames[policy] },
      { label: 'Entries', value: max - min + 1 },
    ],
  );
  result.columns = [
    { key: 'cidr', label: 'CIDR' },
    { key: 'mask', label: 'Subnet mask' },
    { key: 'wildcard', label: 'Wildcard' },
    { key: 'hostBits', label: 'Host bits' },
    { key: 'addresses', label: 'Addresses' },
    { key: 'usable', label: 'Usable' },
    { key: 'supported', label: 'Policy supported' },
  ];
  result.rows = Array.from({ length: max - min + 1 }, (_, index) => {
    const prefix = min + index;
    const network = parseNetwork(`0.0.0.0/${prefix}`);
    const mask = prefixMask(prefix, 32);
    const available = capacity(network, policy, variant);
    return {
      cidr: `/${prefix}`,
      mask: formatIPv4(mask),
      wildcard: formatIPv4(MAX4 ^ mask),
      hostBits: 32 - prefix,
      addresses: network.size.toString(),
      usable: available.count.toString(),
      supported: available.supported,
    };
  });
  result.steps = [
    {
      title: 'Translate each prefix',
      description:
        'Each prefix is a count of leading one bits in the mask; the wildcard is the bitwise inverse of that mask.',
    },
    {
      title: 'Count exact addresses',
      description:
        'For prefix p, the mathematical number of IPv4 addresses is 2^(32 − p). Each added prefix bit halves that count.',
    },
    {
      title: 'Apply the selected rule',
      description: `${policyNames[policy]} determines the usable count. The support column flags sizes outside that policy; /31 and /32 have explicit interpretations.`,
    },
  ];
  result.warnings = [
    'Counts describe mathematical capacity. A row does not imply that its entire address space is assignable.',
    'A /31 needs RFC 3021 point-to-point semantics to provide two endpoints; a /32 is one host route.',
  ];
  result.sources = [policySources[policy], 'https://www.rfc-editor.org/rfc/rfc3021.html'];
  return result;
}

export function calculateIPv6Subnet(input: Record<string, unknown>): CalculationResult {
  const network = parseNetwork(stringInput(input.address, 'IPv6 address with prefix'), 6);
  const address = formatIPv6(network.address);
  const mask = prefixMask(network.prefix, 128);
  const result = makeResult(
    'ipv6-subnet',
    'IPv6 subnet calculation',
    { address: `${address}/${network.prefix}` },
    [
      { label: 'Network', value: network.cidr },
      { label: 'Canonical address', value: address },
      { label: 'Expanded address', value: expandIPv6(network.address) },
      { label: 'First address', value: formatIPv6(network.start) },
      { label: 'Last address', value: formatIPv6(network.end) },
      { label: 'Total addresses', value: network.size.toString() },
      { label: 'Network bits', value: network.prefix },
      { label: 'Remaining address bits', value: 128 - network.prefix },
      { label: 'Broadcast', value: 'IPv6 has no broadcast' },
      { label: 'Prefix mask', value: formatIPv6(mask, false) },
      { label: 'Classification', value: classificationLabel(network) },
    ],
  );
  if (network.prefix <= 64)
    result.summary.push({
      label: '/64 subnet positions',
      value: (1n << BigInt(64 - network.prefix)).toString(),
    });
  result.steps = [
    {
      title: 'Expand to 128 bits',
      description:
        'Eight hexadecimal groups contain 16 bits each. Leading zeroes and one zero-group run can be omitted in display without changing those bits.',
      formula: expandIPv6(network.address),
    },
    {
      title: 'Keep the prefix bits',
      description: `AND the address with ${network.prefix} one bits followed by ${128 - network.prefix} zero bits.`,
      formula: `${address} AND ${formatIPv6(mask, false)} = ${formatIPv6(network.start)}`,
    },
    {
      title: 'Count the full range',
      description:
        'Use exact integer powers of two. IPv6 does not reserve a broadcast address and does not use the IPv4 minus-two rule.',
      formula: `2^${128 - network.prefix} = ${network.size}`,
    },
    {
      title: 'Find the inclusive endpoint',
      description: 'Set every remaining address bit to one to find the final address in the range.',
      formula: `${formatIPv6(network.start)} + ${network.size - 1n} = ${formatIPv6(network.end)}`,
    },
    {
      title: 'Choose operational subnet sizes deliberately',
      description:
        network.prefix === 127
          ? 'RFC 6164 defines /127 usage on inter-router point-to-point links; both addresses are link endpoints.'
          : network.prefix === 128
            ? 'A /128 denotes a single IPv6 address or host route.'
            : 'A /64 is the conventional LAN boundary for SLAAC. Mathematical address count does not account for router, anycast, platform, or operational reservations.',
    },
  ];
  result.warnings = normalizationWarnings(network);
  if (network.prefix > 64 && network.prefix !== 127 && network.prefix !== 128)
    result.warnings.push(
      'This prefix is mathematically valid, but standard Ethernet SLAAC expects /64 LAN subnets. Validate the intended link and configuration method.',
    );
  if (network.prefix === 0)
    result.warnings.push(
      '::/0 contains the complete IPv6 address space, including reserved and unallocated regions; this is not an assignable host pool.',
    );
  result.blocks = [
    {
      name: 'IPv6 network',
      cidr: network.cidr,
      start: formatIPv6(network.start),
      end: formatIPv6(network.end),
      size: network.size.toString(),
    },
  ];
  result.data = {
    network: network.cidr,
    networkAddress: formatIPv6(network.start),
    address,
    prefix: network.prefix,
    firstAddress: formatIPv6(network.start),
    lastAddress: formatIPv6(network.end),
    totalAddresses: network.size.toString(),
    parent: serialNetwork(network),
    broadcast: null,
    subnet64Count: network.prefix <= 64 ? (1n << BigInt(64 - network.prefix)).toString() : null,
  };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc4291.html',
    'https://www.rfc-editor.org/rfc/rfc5952.html',
    'https://www.rfc-editor.org/rfc/rfc6164.html',
  ];
  return result;
}

export function calculateIPv6Format(input: Record<string, unknown>): CalculationResult {
  const network = parseNetwork(stringInput(input.address, 'IPv6 address'), 6);
  const canonical = formatIPv6(network.address);
  const original = stringInput(input.address, 'IPv6 address');
  const hasPrefix = original.includes('/');
  const result = makeResult(
    'ipv6-format',
    'IPv6 expansion and compression',
    { address: hasPrefix ? `${canonical}/${network.prefix}` : canonical },
    [
      { label: 'Canonical RFC 5952 form', value: canonical },
      { label: 'Expanded form', value: expandIPv6(network.address) },
      { label: 'Hexadecimal form', value: formatIPv6(network.address, false) },
      { label: 'Decimal integer', value: network.address.toString() },
      {
        label: 'Binary',
        value: network.address.toString(2).padStart(128, '0').match(/.{16}/g)!.join(' '),
      },
    ],
  );
  if (hasPrefix)
    result.summary.push(
      { label: 'Supplied prefix', value: `/${network.prefix}` },
      { label: 'Normalized network', value: network.cidr },
    );
  result.columns = [
    { key: 'index', label: 'Group' },
    { key: 'hex', label: 'Hexadecimal' },
    { key: 'decimal', label: 'Decimal' },
    { key: 'binary', label: 'Binary' },
  ];
  result.rows = expandIPv6(network.address)
    .split(':')
    .map((hex, index) => ({
      index: index + 1,
      hex,
      decimal: Number.parseInt(hex, 16),
      binary: Number.parseInt(hex, 16).toString(2).padStart(16, '0'),
    }));
  result.steps = [
    {
      title: 'Expand a compressed zero run',
      description:
        'Add omitted zero groups until the address has exactly eight groups, then pad each group to four hexadecimal digits.',
      formula: expandIPv6(network.address),
    },
    {
      title: 'Remove leading zeroes',
      description:
        'Use lowercase hexadecimal and remove leading zeroes from every group; retain one zero when an entire group is zero.',
    },
    {
      title: 'Compress one longest run',
      description:
        'Replace the longest consecutive run of at least two all-zero groups with ::. If runs tie, choose the leftmost run. A single zero group is not compressed.',
    },
    {
      title: 'Recognize mapped addresses',
      description:
        'IPv4-mapped addresses use the ::ffff: prefix and a dotted-decimal IPv4 tail in canonical output. Equivalent hexadecimal input remains valid.',
    },
  ];
  result.data = {
    canonical,
    expanded: expandIPv6(network.address),
    hexadecimal: formatIPv6(network.address, false),
    decimal: network.address.toString(),
  };
  result.sources = ['https://www.rfc-editor.org/rfc/rfc5952.html'];
  return result;
}
