import { type CalculationResult } from '@subnetiq/shared';
import {
  expandIPv6,
  formatIP,
  formatIPv4,
  formatIPv6,
  integerInput,
  makeResult,
  MAX4,
  parseIPv4,
  parseNetwork,
  prefixMask,
  PREVIEW_LIMIT,
  requireCondition,
  stringInput,
} from './core.js';

export function calculateWildcard(input: Record<string, unknown>): CalculationResult {
  const raw = stringInput(input.address, 'IPv4 address or CIDR');
  const network = parseNetwork(raw, 4);
  const explicit = input.mask !== undefined && input.mask !== '';
  const wildcard = explicit
    ? parseIPv4(stringInput(input.mask, 'Wildcard mask'))
    : MAX4 ^ prefixMask(network.prefix, 32);
  if (explicit && raw.includes('/'))
    requireCondition(
      wildcard === (MAX4 ^ prefixMask(network.prefix, 32)),
      'The explicit wildcard and CIDR prefix disagree. Enter a plain IPv4 address when using a different or noncontiguous wildcard.',
    );
  const fixedMask = MAX4 ^ wildcard;
  const base = network.address & fixedMask;
  const contiguous = (wildcard & (wildcard + 1n)) === 0n;
  let lowFreeBits = 0;
  while (lowFreeBits < 32 && (wildcard & (1n << BigInt(lowFreeBits))) !== 0n) lowFreeBits += 1;
  const upperPositions = Array.from(
    { length: 32 - lowFreeBits },
    (_, index) => index + lowFreeBits,
  ).filter((position) => (wildcard & (1n << BigInt(position))) !== 0n);
  const freeBits = lowFreeBits + upperPositions.length;
  const cidrCount = 1n << BigInt(upperPositions.length);
  const count = 1n << BigInt(freeBits);
  const shown = Number(cidrCount < BigInt(PREVIEW_LIMIT) ? cidrCount : BigInt(PREVIEW_LIMIT));
  const cidrs = Array.from({ length: shown }, (_, index) => {
    let address = base;
    for (let bit = 0; bit < upperPositions.length; bit += 1)
      if ((BigInt(index) & (1n << BigInt(bit))) !== 0n)
        address |= 1n << BigInt(upperPositions[bit]!);
    return `${formatIPv4(address)}/${32 - lowFreeBits}`;
  });
  const maskText = formatIPv4(wildcard);
  const baseText = formatIPv4(base);
  const acl = `access-list 10 permit ${baseText} ${maskText}`;
  const result = makeResult(
    'wildcard',
    'Wildcard mask and Cisco ACL helper',
    { address: baseText, mask: maskText },
    [
      { label: 'Canonical match address', value: baseText },
      { label: 'Wildcard mask', value: maskText },
      { label: 'Fixed-bit mask', value: formatIPv4(fixedMask) },
      {
        label: 'Single CIDR representation',
        value: contiguous ? cidrs[0]! : 'Noncontiguous: multiple CIDRs required',
      },
      { label: 'Matched addresses', value: count.toString() },
      { label: 'Exact CIDR count', value: cidrCount.toString() },
      { label: 'Cisco standard ACL', value: acl },
    ],
  );
  result.columns = [{ key: 'cidr', label: 'Equivalent CIDR' }];
  result.rows = cidrs.map((cidr) => ({ cidr }));
  result.steps = [
    {
      title: 'Interpret wildcard bits',
      description:
        'A zero wildcard bit must match the supplied address; a one wildcard bit may be either zero or one.',
      formula: `(candidate AND ${formatIPv4(fixedMask)}) = ${baseText}`,
    },
    {
      title: 'Normalize ignored bits',
      description:
        'Clear all ignored bits in the supplied address. This produces a canonical ACL match address without changing its match set.',
      formula: `${formatIPv4(network.address)} AND ${formatIPv4(fixedMask)} = ${baseText}`,
    },
    {
      title: 'Count the match set',
      description: `There are ${freeBits} ignored bits. Each independently doubles the number of matched addresses.`,
      formula: `2^${freeBits} = ${count}`,
    },
    {
      title: 'Check CIDR compatibility',
      description: contiguous
        ? `All ignored bits form one suffix, so the match set is a single /${32 - lowFreeBits} CIDR.`
        : `Ignored bits are interspersed with fixed bits. Keeping the final ${lowFreeBits} ignored bits as a suffix requires ${cidrCount} exact /${32 - lowFreeBits} CIDRs.`,
    },
    {
      title: 'Review the ACL in its policy context',
      description:
        'This is one standard IPv4 source-address permit statement. Choose an ACL identifier, interface direction, surrounding statements, and the intended implicit-deny behavior before applying it.',
    },
  ];
  result.warnings = [];
  if (!contiguous)
    result.warnings.push(
      'This noncontiguous wildcard is not a subnet mask and must not be represented as one CIDR.',
    );
  if (cidrCount > BigInt(PREVIEW_LIMIT))
    result.warnings.push(
      `Showing ${PREVIEW_LIMIT} of ${cidrCount} equivalent CIDRs. The wildcard expression remains the complete compact match specification.`,
    );
  result.data = {
    address: baseText,
    wildcard: maskText,
    fixedMask: formatIPv4(fixedMask),
    contiguous,
    cidr: contiguous ? cidrs[0] : null,
    cidrs,
    cidrCount: cidrCount.toString(),
    matchedAddresses: count.toString(),
    acl,
    truncated: cidrCount > BigInt(PREVIEW_LIMIT),
    previewCount: shown,
  };
  result.sources = [
    'https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html',
  ];
  return result;
}

function parseRadixInteger(text: string, radix: number): bigint {
  let valueText = text.trim().toLowerCase();
  let sign = 1n;
  if (valueText.startsWith('-')) {
    sign = -1n;
    valueText = valueText.slice(1);
  } else if (valueText.startsWith('+')) valueText = valueText.slice(1);
  const prefixes: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' };
  if (prefixes[radix] && valueText.startsWith(prefixes[radix]!)) valueText = valueText.slice(2);
  const patterns: Record<number, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^\d+$/,
    16: /^[\da-f]+$/,
  };
  requireCondition(
    valueText.length > 0 && valueText.length <= 512 && patterns[radix]!.test(valueText),
    `Value contains a digit that is invalid in base ${radix}, or exceeds 512 digits.`,
  );
  let result = 0n;
  for (const character of valueText)
    result = result * BigInt(radix) + BigInt(Number.parseInt(character, radix));
  return result * sign;
}

export function calculateConvert(input: Record<string, unknown>): CalculationResult {
  const fromBase = integerInput(input.fromBase, 'Input base', 2, 16, 10);
  const toBase = integerInput(input.toBase, 'Output base', 2, 16, 2);
  requireCondition(
    [2, 8, 10, 16].includes(fromBase) && [2, 8, 10, 16].includes(toBase),
    'Choose base 2, 8, 10, or 16.',
  );
  const valueText = stringInput(input.value, 'Value');
  const dotted = valueText.includes('.');
  const parts = dotted ? valueText.split('.') : [valueText];
  requireCondition(
    !dotted || parts.length === 4,
    'A dotted address must have exactly four octets.',
  );
  const values = parts.map((part) => parseRadixInteger(part, fromBase));
  if (dotted)
    requireCondition(
      values.every((value) => value >= 0n && value <= 255n),
      'Each converted dotted octet must be between 0 and 255.',
    );
  const render = (base: number): string =>
    values
      .map((value) => {
        const raw = value.toString(base);
        return dotted && base === 2
          ? raw.padStart(8, '0')
          : dotted && base === 16
            ? raw.padStart(2, '0')
            : raw;
      })
      .join(dotted ? '.' : '');
  const decimal = render(10);
  const result = makeResult(
    'convert',
    'Exact base conversion',
    { value: valueText, fromBase, toBase },
    [
      { label: `Base ${toBase} result`, value: render(toBase) },
      { label: 'Decimal', value: decimal },
      { label: 'Binary', value: render(2) },
      { label: 'Octal', value: render(8) },
      { label: 'Hexadecimal', value: render(16) },
      { label: 'Mode', value: dotted ? 'Four independent IPv4 octets' : 'Integer' },
    ],
  );
  if (!dotted && values[0]! >= 0n && values[0]! <= MAX4)
    result.summary.push({ label: 'As IPv4 integer', value: formatIPv4(values[0]!) });
  result.steps = [
    {
      title: 'Validate each digit',
      description: `Base ${fromBase} permits digit values from zero through ${fromBase - 1}. Prefixes 0b, 0o, and 0x are accepted only for their corresponding bases.`,
    },
    {
      title: 'Evaluate place values',
      description: dotted
        ? 'Convert each octet separately by summing digit × base^position, and require every octet to fit in eight bits.'
        : 'Starting at zero, multiply by the input base and add the next digit. Exact integer arithmetic preserves values larger than JavaScript Number can represent.',
      formula: 'accumulator = accumulator × inputBase + digit',
    },
    {
      title: 'Write the target representation',
      description: `Repeatedly divide by ${toBase}; record the remainder as the next output digit and read remainders in reverse. A negative sign is preserved for integer input.`,
      formula: `base ${fromBase} → decimal ${decimal} → base ${toBase}: ${render(toBase)}`,
    },
  ];
  result.data = {
    converted: render(toBase),
    decimal,
    binary: render(2),
    octal: render(8),
    hexadecimal: render(16),
    dotted,
  };
  return result;
}

export function parseMAC(input: string): number[] {
  const text = stringInput(input, 'MAC address');
  const valid =
    /^[\da-f]{12}$/i.test(text) ||
    /^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(text) ||
    /^(?:[\da-f]{2}-){5}[\da-f]{2}$/i.test(text) ||
    /^(?:[\da-f]{4}\.){2}[\da-f]{4}$/i.test(text);
  requireCondition(
    valid,
    'Enter a 48-bit MAC as 00:1A:2B:3C:4D:5E, 00-1A-2B-3C-4D-5E, 001A.2B3C.4D5E, or 001A2B3C4D5E.',
  );
  const raw = text.replace(/[:.-]/g, '');
  return raw.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16));
}

export function calculateMAC(input: Record<string, unknown>): CalculationResult {
  const bytes = parseMAC(stringInput(input.address, 'MAC address'));
  const parts = bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase());
  const raw = parts.join('');
  const normalized = parts.join(':');
  const multicast = (bytes[0]! & 1) === 1;
  const locallyAdministered = (bytes[0]! & 2) === 2;
  const broadcast = bytes.every((byte) => byte === 255);
  const zero = bytes.every((byte) => byte === 0);
  const oui = parts.slice(0, 3).join(':');
  const result = makeResult(
    'mac',
    'MAC address formatting and bit analysis',
    { address: normalized },
    [
      { label: 'Canonical MAC', value: normalized },
      { label: 'Hyphen notation', value: parts.join('-') },
      { label: 'Cisco dotted notation', value: raw.match(/.{4}/g)!.join('.') },
      { label: 'Plain hexadecimal', value: raw },
      { label: 'First 24 bits', value: oui },
      {
        label: 'Address type',
        value: broadcast
          ? 'Ethernet broadcast'
          : multicast
            ? 'Multicast / group'
            : 'Unicast / individual',
      },
      {
        label: 'Administration',
        value: locallyAdministered ? 'Locally administered' : 'Universally administered',
      },
      { label: 'Binary', value: bytes.map((byte) => byte.toString(2).padStart(8, '0')).join(' ') },
    ],
  );
  result.steps = [
    {
      title: 'Normalize six octets',
      description:
        'Remove only the permitted separator format and parse exactly six two-digit hexadecimal bytes.',
      formula: normalized,
    },
    {
      title: 'Inspect the I/G bit',
      description: `The least significant bit of the first octet is ${bytes[0]! & 1}, indicating ${multicast ? 'a group or multicast address' : 'an individual or unicast address'}.`,
      formula: `${parts[0]} AND 01 = ${(bytes[0]! & 1).toString(16)}`,
    },
    {
      title: 'Inspect the U/L bit',
      description: `The next bit of the first octet is ${locallyAdministered ? 'set' : 'clear'}, indicating ${locallyAdministered ? 'local administration' : 'universal administration'}.`,
      formula: `${parts[0]} AND 02 = ${(bytes[0]! & 2).toString(16)}`,
    },
    {
      title: 'Interpret vendor identification carefully',
      description:
        'The first 24 bits are an OUI-style prefix, but modern IEEE assignments can be more specific. A locally administered or randomized MAC does not establish a device vendor or person.',
    },
  ];
  result.warnings = [];
  if (locallyAdministered)
    result.warnings.push(
      'A locally administered or randomized address does not support reliable vendor attribution from its prefix.',
    );
  if (zero)
    result.warnings.push(
      'The all-zero MAC is commonly a placeholder or unset value; verify whether it is valid for the intended interface.',
    );
  result.data = {
    normalized,
    oui,
    locallyAdministered,
    multicast,
    broadcast,
    bytes,
    hexadecimal: raw,
    cisco: raw.match(/.{4}/g)!.join('.'),
  };
  result.sources = ['https://www.rfc-editor.org/rfc/rfc9542.html'];
  return result;
}

export function calculateEUI64(input: Record<string, unknown>): CalculationResult {
  const bytes = parseMAC(stringInput(input.mac, 'MAC address'));
  requireCondition(
    (bytes[0]! & 1) === 0 && !bytes.every((byte) => byte === 0),
    'Use a valid individual (unicast), nonzero MAC address for an interface identifier.',
  );
  const prefix = parseNetwork(stringInput(input.prefix, 'IPv6 prefix', 'fe80::/64'), 6, true);
  requireCondition(prefix.prefix === 64, 'Modified EUI-64 generation requires an IPv6 /64 prefix.');
  requireCondition(
    prefix.address === prefix.start,
    `The prefix must be aligned; use ${prefix.cidr}.`,
  );
  const modified = [bytes[0]! ^ 2, bytes[1]!, bytes[2]!, 255, 254, bytes[3]!, bytes[4]!, bytes[5]!];
  const identifier = modified.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  const address = prefix.start | identifier;
  const mac = bytes
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
  const iid = modified
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .match(/.{4}/g)!
    .join(':');
  const result = makeResult(
    'eui64',
    'Modified EUI-64 interface identifier',
    { mac, prefix: prefix.cidr },
    [
      { label: 'Input MAC', value: mac },
      { label: 'IPv6 prefix', value: prefix.cidr },
      { label: 'Modified interface identifier', value: iid },
      { label: 'Generated IPv6 address', value: formatIPv6(address) },
      { label: 'Expanded address', value: expandIPv6(address) },
    ],
  );
  result.steps = [
    {
      title: 'Split the 48-bit MAC',
      description: 'Separate the first three MAC octets from the last three.',
    },
    {
      title: 'Insert ff:fe in the middle',
      description: 'Adding two octets expands the identifier from 48 to 64 bits.',
      formula: `${bytes
        .slice(0, 3)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(':')}:ff:fe:${bytes
        .slice(3)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(':')}`,
    },
    {
      title: 'Invert the universal/local bit',
      description:
        'Toggle the second-lowest bit of the first byte with XOR 0x02. Preserve every other bit.',
      formula: `0x${bytes[0]!.toString(16).padStart(2, '0')} XOR 0x02 = 0x${modified[0]!.toString(16).padStart(2, '0')}`,
    },
    {
      title: 'Combine with the /64 prefix',
      description:
        'Keep the network prefix in the high 64 bits and insert the modified identifier in the low 64 bits.',
      formula: `${prefix.cidr} + ${iid} = ${formatIPv6(address)}`,
    },
  ];
  result.warnings = [
    'A stable MAC-derived IPv6 address can expose a persistent identifier. RFC 8064 recommends semantically opaque interface identifiers; this conversion is for understanding and configurations that explicitly require modified EUI-64.',
  ];
  result.data = {
    mac,
    prefix: prefix.cidr,
    interfaceId: iid,
    address: formatIPv6(address),
    expanded: expandIPv6(address),
  };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc4291.html',
    'https://www.rfc-editor.org/rfc/rfc8064.html',
  ];
  return result;
}

function reverseIPv4(value: bigint, prefix: number): string {
  const labels = formatIPv4(value)
    .split('.')
    .slice(0, prefix / 8)
    .reverse();
  return [...labels, 'in-addr', 'arpa'].join('.') + '.';
}

function reverseIPv6(value: bigint, prefix: number): string {
  const labels = value
    .toString(16)
    .padStart(32, '0')
    .slice(0, prefix / 4)
    .split('')
    .reverse();
  return [...labels, 'ip6', 'arpa'].join('.') + '.';
}

export function calculateReverseDNS(input: Record<string, unknown>): CalculationResult {
  const raw = stringInput(input.address, 'IP address or network');
  const network = parseNetwork(raw);
  const family = network.family;
  const hostName =
    family === 4 ? reverseIPv4(network.address, 32) : reverseIPv6(network.address, 128);
  const boundary = family === 4 ? 8 : 4;
  const aligned = network.prefix % boundary === 0;
  let zones: string[];
  let delegation: string;
  let classless: {
    parentZone: string;
    childZone: string;
    startLabel: number;
    endLabel: number;
  } | null = null;
  if (aligned) {
    zones = [
      family === 4
        ? reverseIPv4(network.start, network.prefix)
        : reverseIPv6(network.start, network.prefix),
    ];
    delegation =
      network.prefix === network.bits
        ? 'Individual host reverse name'
        : 'Boundary-aligned reverse zone';
  } else if (family === 4 && network.prefix > 24) {
    const parentZone = reverseIPv4(network.start, 24);
    const startLabel = Number(network.start & 255n);
    const endLabel = Number(network.end & 255n);
    const childZone = `${startLabel}-${endLabel}.${parentZone}`;
    classless = { parentZone, childZone, startLabel, endLabel };
    zones = [childZone];
    delegation = 'RFC 2317 classless delegation with parent CNAMEs';
  } else {
    const targetPrefix = Math.ceil(network.prefix / boundary) * boundary;
    const total = 2 ** (targetPrefix - network.prefix);
    const stride = 1n << BigInt(network.bits - targetPrefix);
    zones = Array.from({ length: total }, (_, index) =>
      family === 4
        ? reverseIPv4(network.start + BigInt(index) * stride, targetPrefix)
        : reverseIPv6(network.start + BigInt(index) * stride, targetPrefix),
    );
    delegation = `Delegate ${zones.length} /${targetPrefix} ${family === 4 ? 'octet' : 'nibble'}-aligned zones`;
  }
  const normalizedAddress = raw.includes('/')
    ? `${formatIP(network.address, family)}/${network.prefix}`
    : formatIP(network.address, family);
  const result = makeResult(
    'reverse-dns',
    'Reverse DNS names and delegation guidance',
    { address: normalizedAddress },
    [
      { label: 'Input address', value: formatIP(network.address, family) },
      { label: 'Host reverse name', value: hostName },
      { label: 'Network', value: network.cidr },
      { label: 'Delegation form', value: delegation },
      { label: 'Zone or host names', value: zones.length },
    ],
  );
  result.columns = [
    { key: 'name', label: 'Reverse name or zone' },
    { key: 'purpose', label: 'Purpose' },
  ];
  result.rows = zones.map((name) => ({
    name,
    purpose: classless
      ? 'Example child-zone name; parent operator agreement required'
      : network.prefix === network.bits
        ? 'Host PTR owner name'
        : 'Aligned delegation zone',
  }));
  if (classless) {
    const entries = Array.from(
      { length: classless.endLabel - classless.startLabel + 1 },
      (_, index) => {
        const label = classless!.startLabel + index;
        return `${label}.${classless!.parentZone} IN CNAME ${label}.${classless!.childZone}`;
      },
    );
    result.data = { hostName, zones, classless, parentCnames: entries };
  } else result.data = { hostName, zones, classless: null };
  result.steps = [
    {
      title: 'Form the host reverse name',
      description:
        family === 4
          ? 'Reverse all four decimal octets and append in-addr.arpa.'
          : 'Expand to 32 hexadecimal nibbles, reverse each individual nibble, and append ip6.arpa.',
      formula: hostName,
    },
    {
      title: 'Separate host records from delegation',
      description:
        'A host reverse name identifies where a PTR record belongs. Authority to serve that name or delegate its parent zone comes from the reverse-zone operator.',
    },
    {
      title: 'Respect DNS label boundaries',
      description: classless
        ? `The prefix is longer than /24 without reaching an octet boundary. RFC 2317 permits CNAMEs in ${classless.parentZone} pointing into an agreed child zone such as ${classless.childZone}.`
        : aligned
          ? `The /${network.prefix} prefix falls on a complete ${family === 4 ? 'octet' : 'hexadecimal nibble'} boundary.`
          : `This prefix ends within a DNS label. Use the ${zones.length} child zones at the next complete ${family === 4 ? 'octet' : 'nibble'} boundary rather than inventing a partial DNS label.`,
    },
    {
      title: 'Arrange authoritative service',
      description:
        'Coordinate NS delegation and PTR targets with the address provider or parent-zone operator. The generated names and classless aliases do not create DNS records.',
    },
  ];
  result.warnings = [
    'Reverse name generation does not establish DNS authority or guarantee that a PTR record exists.',
  ];
  if (classless)
    result.warnings.push(
      'The RFC 2317 child-zone label shown is a convention that must be agreed with the parent-zone operator; configure NS records and host PTR targets using your actual authoritative names.',
    );
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc1035.html',
    family === 4
      ? 'https://www.rfc-editor.org/rfc/rfc2317.html'
      : 'https://www.rfc-editor.org/rfc/rfc3596.html',
  ];
  return result;
}
