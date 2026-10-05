import { type CalculationResult } from '@subnetiq/shared';
import { classifyAddress } from './classification.js';
import {
  formatIPv4,
  formatIPv6,
  makeResult,
  MAX4,
  parseIPv4,
  parseNetwork,
  prefixMask,
  requireCondition,
  stringInput,
  type Network,
} from './core.js';

function translationPrefix(input: string): Network {
  const prefix = parseNetwork(input, 6, true);
  requireCondition(
    [32, 40, 48, 56, 64, 96].includes(prefix.prefix),
    'RFC 6052 NAT64 prefixes must be /32, /40, /48, /56, /64, or /96.',
  );
  requireCondition(
    prefix.address === prefix.start,
    `The translation prefix must be aligned; use ${prefix.cidr}.`,
  );
  requireCondition(
    ((prefix.start >> 56n) & 255n) === 0n,
    'RFC 6052 requires the reserved u octet at IPv6 bits 64–71 to be zero, including in /96 prefixes.',
  );
  return prefix;
}

export function encodeNAT64(ipv4: bigint, inputPrefix = '64:ff9b::/96'): bigint {
  requireCondition(
    ipv4 >= 0n && ipv4 <= MAX4,
    'NAT64 encoding requires a 32-bit unsigned IPv4 value.',
  );
  const prefix = translationPrefix(inputPrefix);
  if (prefix.prefix === 96) return prefix.start | ipv4;
  let result = prefix.start;
  for (let index = 0; index < 32; index += 1) {
    const position = prefix.prefix + index < 64 ? prefix.prefix + index : prefix.prefix + index + 8;
    if ((ipv4 & (1n << BigInt(31 - index))) !== 0n) result |= 1n << BigInt(127 - position);
  }
  return result;
}

export function decodeNAT64(ipv6: bigint, inputPrefix = '64:ff9b::/96'): bigint {
  const prefix = translationPrefix(inputPrefix);
  requireCondition(
    ipv6 >= 0n && ipv6 < 1n << 128n,
    'NAT64 decoding requires a 128-bit unsigned IPv6 value.',
  );
  requireCondition(
    (ipv6 & prefixMask(prefix.prefix, 128)) === prefix.start,
    `The IPv6 address is outside the configured NAT64 prefix ${prefix.cidr}.`,
  );
  requireCondition(
    ((ipv6 >> 56n) & 255n) === 0n,
    'The IPv6 address has a nonzero RFC 6052 reserved u octet and is not a valid translation address.',
  );
  if (prefix.prefix === 96) return ipv6 & MAX4;
  let result = 0n;
  for (let index = 0; index < 32; index += 1) {
    const position = prefix.prefix + index < 64 ? prefix.prefix + index : prefix.prefix + index + 8;
    result = (result << 1n) | ((ipv6 >> BigInt(127 - position)) & 1n);
  }
  return result;
}

export function calculateIPv4Map(input: Record<string, unknown>): CalculationResult {
  const raw = stringInput(input.address, 'Address');
  const mode = input.mode ?? 'mapped';
  requireCondition(
    mode === 'mapped' || mode === 'nat64' || mode === '6to4',
    'Choose mapped, nat64, or 6to4 conversion mode.',
  );
  const direction = input.direction ?? (raw.includes(':') ? 'decode' : 'encode');
  requireCondition(
    direction === 'encode' || direction === 'decode',
    'Conversion direction must be encode or decode.',
  );
  const prefix =
    mode === 'nat64'
      ? translationPrefix(stringInput(input.prefix, 'NAT64 prefix', '64:ff9b::/96'))
      : null;
  let ipv4: bigint;
  let ipv6: bigint;
  if (direction === 'encode') {
    ipv4 = parseIPv4(raw);
    ipv6 =
      mode === 'mapped'
        ? (65535n << 32n) | ipv4
        : mode === 'nat64'
          ? encodeNAT64(ipv4, prefix!.cidr)
          : (0x2002n << 112n) | (ipv4 << 80n);
  } else {
    const parsed = parseNetwork(raw, 6);
    ipv6 = parsed.address;
    if (mode === 'mapped') {
      requireCondition(
        ipv6 >> 32n === 65535n,
        'The address is not an IPv4-mapped address in ::ffff:0:0/96.',
      );
      ipv4 = ipv6 & MAX4;
    } else if (mode === 'nat64') ipv4 = decodeNAT64(ipv6, prefix!.cidr);
    else {
      requireCondition(
        ipv6 >> 112n === 0x2002n,
        'A 6to4 address must begin with the 2002::/16 prefix.',
      );
      ipv4 = (ipv6 >> 80n) & MAX4;
    }
  }
  const ipv4Text = formatIPv4(ipv4);
  const ipv6Text = formatIPv6(ipv6);
  const resultAddress = mode === '6to4' && direction === 'encode' ? `${ipv6Text}/48` : ipv6Text;
  const normalizedInput: Record<string, unknown> = {
    address: direction === 'encode' ? ipv4Text : ipv6Text,
    mode,
    direction,
  };
  if (prefix) normalizedInput.prefix = prefix.cidr;
  const title =
    mode === 'mapped'
      ? 'IPv4-mapped IPv6 conversion'
      : mode === 'nat64'
        ? 'RFC 6052 NAT64 address conversion'
        : 'Historical 6to4 prefix conversion';
  const result = makeResult('ipv4-map', title, normalizedInput, [
    {
      label: 'Direction',
      value: direction === 'encode' ? 'IPv4 to IPv6 representation' : 'Extract embedded IPv4',
    },
    { label: 'IPv4 address', value: ipv4Text },
    {
      label: mode === '6to4' && direction === 'encode' ? '6to4 /48 prefix' : 'IPv6 address',
      value: resultAddress,
    },
    {
      label: 'IPv4 hexadecimal',
      value: ipv4.toString(16).padStart(8, '0').match(/.{4}/g)!.join(':'),
    },
    { label: 'Mode', value: mode },
  ]);
  if (prefix) result.summary.push({ label: 'Translation prefix', value: prefix.cidr });
  result.steps = [
    {
      title: 'Validate the address and direction',
      description: `${direction === 'encode' ? 'Encode' : 'Extract'} the same 32 IPv4 address bits. The selected mode determines where they belong in IPv6.`,
    },
    {
      title:
        mode === 'mapped'
          ? 'Use the mapped-address marker'
          : mode === 'nat64'
            ? 'Apply the RFC 6052 layout'
            : 'Build the historical 6to4 prefix',
      description:
        mode === 'mapped'
          ? 'Use 80 zero bits, 16 one bits, then the 32 IPv4 bits. The ::ffff: marker represents an IPv4 endpoint in an IPv6-capable API; it does not create a NAT64 translator.'
          : mode === 'nat64'
            ? `Place the IPv4 bits after the /${prefix!.prefix} prefix${prefix!.prefix === 96 ? ' in the low 32 bits' : ', skipping reserved IPv6 bits 64–71'}. The reserved u octet must remain zero.`
            : 'Use the 16-bit 2002 marker, followed by the 32 IPv4 bits, to form a /48 IPv6 site prefix. The remaining bits identify subnets and interfaces.',
    },
    {
      title: 'Preserve the distinction from connectivity',
      description:
        'An address representation does not deploy translation, DNS64, routing, tunnels, or a dual-stack network. Those functions require separately configured infrastructure.',
    },
  ];
  result.warnings = [];
  let operationallyEligible: boolean | null = null;
  if (mode === 'nat64') {
    const classification = classifyAddress(ipv4, 4);
    const nonGlobal =
      classification.globallyReachable !== true ||
      classification.source !== true ||
      classification.destination !== true;
    if (prefix!.cidr === '64:ff9b::/96') {
      operationallyEligible = !nonGlobal;
      if (nonGlobal)
        result.warnings.push(
          'This is a mathematical encoding only. RFC 6052 prohibits using the 64:ff9b::/96 well-known prefix to translate non-global IPv4 addresses; use an appropriate network-specific prefix and policy for that environment.',
        );
    }
    if (direction === 'decode' && encodeNAT64(ipv4, prefix!.cidr) !== ipv6)
      result.warnings.push(
        'The address contains a nonzero reserved suffix. RFC 6052 recommends a zero suffix; decoding ignores those suffix bits while preserving the required zero u octet.',
      );
    result.sources = ['https://www.rfc-editor.org/rfc/rfc6052.html'];
  } else if (mode === '6to4') {
    result.warnings.push(
      '6to4 is presented as historical transition material. RFC 7526 deprecates the 6to4 relay anycast mechanism; do not treat this conversion as a recommendation for a new deployment.',
    );
    result.sources = [
      'https://www.rfc-editor.org/rfc/rfc3056.html',
      'https://www.rfc-editor.org/rfc/rfc7526.html',
    ];
  } else result.sources = ['https://www.rfc-editor.org/rfc/rfc4291.html'];
  result.data = {
    ipv4: ipv4Text,
    ipv6: ipv6Text,
    result: direction === 'decode' ? ipv4Text : resultAddress,
    mode,
    direction,
    prefix: prefix?.cidr ?? (mode === 'mapped' ? '::ffff:0:0/96' : '2002::/16'),
    operationallyEligible,
  };
  return result;
}
