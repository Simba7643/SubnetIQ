import { type CalculationResult } from '@subnetiq/shared';
import { decimalInput, integerInput, makeResult, requireCondition, stringInput } from './core.js';

interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

function fraction(value: number): Fraction {
  const text = value.toString().toLowerCase();
  const [mantissa = '0', exponentText = '0'] = text.split('e');
  const [whole = '0', decimal = ''] = mantissa.split('.');
  const exponent = Number(exponentText) - decimal.length;
  const digits = BigInt(whole + decimal);
  return exponent >= 0
    ? { numerator: digits * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-exponent) };
}

function divideText(numerator: bigint, denominator: bigint, places = 6): string {
  const scale = 10n ** BigInt(places);
  const rounded = (numerator * scale + denominator / 2n) / denominator;
  const whole = rounded / scale;
  const decimals = (rounded % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${whole}${decimals ? `.${decimals}` : ''}`;
}

function humanDuration(seconds: number): string {
  if (seconds === 0) return '0 seconds';
  if (seconds < 0.001) return `${(seconds * 1000000).toPrecision(4)} microseconds`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(3)} milliseconds`;
  if (seconds < 60) return `${seconds.toFixed(3)} seconds`;
  const totalSeconds = Math.ceil(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    remainder ? `${remainder}s` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function calculateBandwidth(input: Record<string, unknown>): CalculationResult {
  const size = decimalInput(input.size, 'Transfer size', 0, 1e15);
  const speed = decimalInput(input.speed, 'Link speed', 0, 1e15);
  requireCondition(speed > 0, 'Link speed must be greater than zero.');
  const efficiency = decimalInput(input.efficiency, 'Efficiency percentage', 0, 100, 100);
  requireCondition(efficiency > 0, 'Efficiency must be greater than zero and at most 100 percent.');
  const sizeUnit = stringInput(input.sizeUnit, 'Size unit', 'MB');
  const speedUnit = stringInput(input.speedUnit, 'Speed unit', 'Mbps');
  const sizeFactors: Record<string, bigint> = {
    B: 1n,
    KB: 1000n,
    MB: 1000000n,
    GB: 1000000000n,
    TB: 1000000000000n,
    KiB: 1024n,
    MiB: 1048576n,
    GiB: 1073741824n,
    TiB: 1099511627776n,
  };
  const speedFactors: Record<string, bigint> = {
    bps: 1n,
    Kbps: 1000n,
    Mbps: 1000000n,
    Gbps: 1000000000n,
    Tbps: 1000000000000n,
  };
  requireCondition(
    Object.prototype.hasOwnProperty.call(sizeFactors, sizeUnit),
    'Size unit must be B, KB, MB, GB, TB, KiB, MiB, GiB, or TiB.',
  );
  requireCondition(
    Object.prototype.hasOwnProperty.call(speedFactors, speedUnit),
    'Speed unit must be bps, Kbps, Mbps, Gbps, or Tbps.',
  );
  const sizeFraction = fraction(size);
  const speedFraction = fraction(speed);
  const efficiencyFraction = fraction(efficiency);
  const byteNumerator = sizeFraction.numerator * sizeFactors[sizeUnit]!;
  const byteDenominator = sizeFraction.denominator;
  const linkNumerator = speedFraction.numerator * speedFactors[speedUnit]!;
  const linkDenominator = speedFraction.denominator;
  const effectiveNumerator = linkNumerator * efficiencyFraction.numerator;
  const effectiveDenominator = linkDenominator * efficiencyFraction.denominator * 100n;
  const secondsNumerator = byteNumerator * 8n * effectiveDenominator;
  const secondsDenominator = byteDenominator * effectiveNumerator;
  const seconds = Number(secondsNumerator) / Number(secondsDenominator);
  requireCondition(
    Number.isFinite(seconds),
    'The supplied values produce an unrepresentable transfer duration; use a smaller size or a larger effective link speed.',
  );
  const bytes = divideText(byteNumerator, byteDenominator);
  const bits = divideText(byteNumerator * 8n, byteDenominator);
  const effectiveSpeed = divideText(effectiveNumerator, effectiveDenominator);
  const secondsText =
    seconds > 0 && seconds < 0.000001
      ? seconds.toExponential(6)
      : divideText(secondsNumerator, secondsDenominator);
  const result = makeResult(
    'bandwidth',
    'Bandwidth and transfer time',
    { size, sizeUnit, speed, speedUnit, efficiency },
    [
      { label: 'Transfer time', value: humanDuration(seconds) },
      { label: 'Seconds', value: secondsText },
      { label: 'Data size in bytes', value: bytes },
      { label: 'Data size in bits', value: bits },
      { label: 'Link speed in bits/s', value: divideText(linkNumerator, linkDenominator) },
      { label: 'Effective bits/s', value: effectiveSpeed },
      { label: 'Efficiency', value: `${efficiency}%` },
      {
        label: 'Effective bytes/s',
        value: divideText(effectiveNumerator, effectiveDenominator * 8n),
      },
    ],
  );
  result.steps = [
    {
      title: 'Normalize the data unit',
      description:
        'Decimal KB/MB/GB/TB use powers of 1000; binary KiB/MiB/GiB/TiB use powers of 1024. An uppercase B means bytes.',
      formula: `${size} ${sizeUnit} × ${sizeFactors[sizeUnit]} = ${bytes} bytes`,
    },
    {
      title: 'Convert bytes to bits',
      description: 'Network bit rates use lowercase b. Every byte contains eight bits.',
      formula: `${bytes} × 8 = ${bits} bits`,
    },
    {
      title: 'Apply efficiency',
      description:
        'Multiply the nominal decimal link bit rate by the useful-throughput percentage. This models all chosen overhead as one explicit factor.',
      formula: `${divideText(linkNumerator, linkDenominator)} × ${efficiency} / 100 = ${effectiveSpeed} bits/s`,
    },
    {
      title: 'Divide work by throughput',
      description:
        'Divide total bits by effective bits per second. Displayed values are rounded; the result retains the exact rational duration.',
      formula: `${bits} / ${effectiveSpeed} = ${secondsText} seconds`,
    },
  ];
  result.warnings = [
    'This estimate assumes constant throughput. Latency, packet loss, congestion, storage speed, protocol behavior, and startup overhead can change actual completion time.',
  ];
  result.data = {
    bytes,
    bits,
    effectiveBitsPerSecond: effectiveSpeed,
    seconds,
    secondsText,
    exactDuration: {
      numerator: secondsNumerator.toString(),
      denominator: secondsDenominator.toString(),
      unit: 'seconds',
    },
    efficiency,
  };
  result.sources = [
    'https://www.nist.gov/pml/owm/metric-si-prefixes',
    'https://www.rfc-editor.org/rfc/rfc6349.html',
  ];
  return result;
}

export function calculateMTU(input: Record<string, unknown>): CalculationResult {
  const mtu = integerInput(input.mtu, 'Outer path MTU', 68, 65535, 1500);
  const ipVersion = integerInput(input.ipVersion, 'IP version', 4, 6, 4);
  requireCondition(ipVersion === 4 || ipVersion === 6, 'IP version must be 4 or 6.');
  const tcpOptions = integerInput(input.tcpOptions, 'TCP options bytes', 0, 40, 0);
  requireCondition(
    tcpOptions % 4 === 0,
    'TCP options including padding must occupy a multiple of 4 bytes, from 0 through 40.',
  );
  const encapsulation = integerInput(
    input.encapsulation,
    'Encapsulation overhead bytes',
    0,
    65515,
    0,
  );
  const ipOptions = integerInput(input.ipOptions, 'IPv4 options bytes', 0, 40, 0);
  requireCondition(
    ipOptions % 4 === 0,
    'IPv4 options including padding must occupy a multiple of 4 bytes.',
  );
  requireCondition(
    ipVersion === 4 || ipOptions === 0,
    'Use IPv6 extension header bytes instead of IPv4 options for IPv6.',
  );
  const extensionHeaders = integerInput(
    input.extensionHeaders,
    'IPv6 extension header bytes',
    0,
    65515,
    0,
  );
  requireCondition(
    ipVersion === 6 || extensionHeaders === 0,
    'IPv6 extension header bytes apply only to IPv6.',
  );
  const innerMtu = mtu - encapsulation;
  const ipBaseHeader = ipVersion === 4 ? 20 : 40;
  const ipExtra = ipVersion === 4 ? ipOptions : extensionHeaders;
  const baseMss = innerMtu - ipBaseHeader - 20;
  const payload = baseMss - tcpOptions - ipExtra;
  requireCondition(
    payload > 0,
    'Headers and encapsulation consume the complete MTU; increase MTU or reduce overhead.',
  );
  const result = makeResult(
    'mtu',
    'MTU, TCP MSS, and payload budget',
    { mtu, ipVersion, tcpOptions, encapsulation, ipOptions, extensionHeaders },
    [
      { label: 'Outer path MTU', value: `${mtu} bytes` },
      { label: 'Encapsulation overhead', value: `${encapsulation} bytes` },
      { label: 'Effective inner IP MTU', value: `${innerMtu} bytes` },
      { label: 'Base IP header', value: `${ipBaseHeader} bytes` },
      { label: 'Additional IP headers', value: `${ipExtra} bytes` },
      { label: 'Base TCP header', value: '20 bytes' },
      { label: 'TCP options and padding', value: `${tcpOptions} bytes` },
      {
        label: 'Base MSS ceiling',
        value: `${baseMss} bytes`,
        description:
          'RFC 6691 subtracts only fixed IP and TCP headers when determining the MSS value.',
      },
      { label: 'TCP data per packet with chosen headers', value: `${payload} bytes` },
      {
        label: 'Header fraction of outer MTU',
        value: `${(((mtu - payload) / mtu) * 100).toFixed(2)}%`,
      },
    ],
  );
  result.steps = [
    {
      title: 'Deduct tunnel overhead once',
      description:
        'The input is the outer IP path MTU. Encapsulation consumes part of that packet budget, leaving the effective inner IP MTU. Ethernet framing is outside an IP MTU.',
      formula: `${mtu} − ${encapsulation} = ${innerMtu} bytes`,
    },
    {
      title: 'Calculate the base MSS ceiling',
      description: `Subtract the fixed ${ipVersion === 4 ? '20-byte IPv4' : '40-byte IPv6'} header and the 20-byte fixed TCP header. RFC 6691 distinguishes this advertised MSS value from option overhead.`,
      formula: `${innerMtu} − ${ipBaseHeader} − 20 = ${baseMss} bytes`,
    },
    {
      title: 'Budget the actual packet headers',
      description:
        'The sender reduces data payload to account for IP options or extension headers and TCP options present in each packet.',
      formula: `${baseMss} − ${ipExtra} − ${tcpOptions} = ${payload} bytes of TCP data`,
    },
    {
      title: 'Respect the path',
      description:
        'MSS negotiation and path-MTU discovery are separate mechanisms. This calculation models a specified packet budget and does not discover a network path or guarantee that intermediate equipment accepts it.',
    },
  ];
  result.warnings = [];
  if (ipVersion === 6 && innerMtu < 1280)
    result.warnings.push(
      'IPv6 requires a minimum link MTU of 1280 bytes or suitable adaptation below IPv6. The computed inner MTU is smaller; review the tunnel and link design.',
    );
  result.data = {
    mtu,
    ipVersion,
    encapsulation,
    innerMtu,
    ipHeader: ipBaseHeader + ipExtra,
    tcpHeader: 20 + tcpOptions,
    baseMss,
    mss: baseMss,
    tcpPayload: payload,
    udpPayload: innerMtu - ipBaseHeader - ipExtra - 8,
    tcpOptions,
    ipOptions,
    extensionHeaders,
  };
  result.sources = [
    'https://www.rfc-editor.org/rfc/rfc6691.html',
    'https://www.rfc-editor.org/rfc/rfc8200.html',
    'https://www.rfc-editor.org/rfc/rfc9293.html',
  ];
  return result;
}
