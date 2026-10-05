import { type NetworkPolicy } from '@subnetiq/shared';
import { networkFrom, requireCondition, type Network } from './core.js';

export type CloudVariant = 'standard' | 'byoip' | 'secondary';
export interface Capacity {
  count: bigint;
  reserved: bigint;
  first: bigint | null;
  last: bigint | null;
  supported: boolean;
  description: string;
  warnings: string[];
}

export const policyNames: Record<NetworkPolicy, string> = {
  lan: 'Conventional IPv4 LAN',
  'point-to-point': 'Point-to-point with RFC 3021',
  aws: 'AWS VPC',
  azure: 'Azure VNet',
  gcp: 'Google Cloud primary IPv4',
};
export const policySources: Record<NetworkPolicy, string> = {
  lan: 'https://www.rfc-editor.org/rfc/rfc1122.html',
  'point-to-point': 'https://www.rfc-editor.org/rfc/rfc3021.html',
  aws: 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html',
  azure: 'https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq',
  gcp: 'https://docs.cloud.google.com/vpc/docs/subnets',
};
export const cloudLimits = {
  aws: { min: 16, max: 28 },
  azure: { min: 2, max: 29 },
  gcp: { min: 4, max: 29 },
};

export function readPolicy(value: unknown, fallback: NetworkPolicy = 'lan'): NetworkPolicy {
  if (value === undefined || value === '') return fallback;
  requireCondition(
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(policyNames, value),
    'Choose lan, point-to-point, aws, azure, or gcp allocation policy.',
  );
  return value as NetworkPolicy;
}

export function readVariant(value: unknown, policy: NetworkPolicy): CloudVariant {
  if (value === undefined || value === '' || value === 'standard') return 'standard';
  requireCondition(
    (policy === 'aws' && value === 'byoip') || (policy === 'gcp' && value === 'secondary'),
    'The selected allocation variant must be AWS byoip or Google Cloud secondary.',
  );
  return value as CloudVariant;
}

export function capacity(
  network: Network,
  policy: NetworkPolicy = 'lan',
  variant: CloudVariant = 'standard',
): Capacity {
  requireCondition(
    network.family === 4,
    'IPv4 allocation policy requires an IPv4 network. IPv6 has no broadcast subtraction.',
  );
  readPolicy(policy);
  readVariant(variant, policy);
  if (policy === 'aws' || policy === 'azure' || policy === 'gcp') {
    const limit = cloudLimits[policy];
    const supported = network.prefix >= limit.min && network.prefix <= limit.max;
    const zeroReservations = variant === 'byoip' || variant === 'secondary';
    const firstReserved = zeroReservations ? 0n : policy === 'gcp' ? 2n : 4n;
    const lastReserved = zeroReservations ? 0n : policy === 'gcp' ? 2n : 1n;
    const requestedReservations = firstReserved + lastReserved;
    const reserved = requestedReservations > network.size ? network.size : requestedReservations;
    const count = network.size - reserved;
    const description = zeroReservations
      ? `${policyNames[policy]} ${variant} variant: no standard first/last-address reservation is subtracted.`
      : `${policyNames[policy]} reserves the first ${firstReserved} and last ${lastReserved} addresses in this standard IPv4 range.`;
    const warnings = supported
      ? []
      : [
          `${policyNames[policy]} supports IPv4 prefixes /${limit.min} through /${limit.max}; /${network.prefix} is a mathematical capacity estimate outside that supported range.`,
        ];
    return {
      count,
      reserved,
      first: count > 0n ? network.start + firstReserved : null,
      last: count > 0n ? network.end - lastReserved : null,
      supported,
      description,
      warnings,
    };
  }
  if (network.prefix === 32)
    return {
      count: 1n,
      reserved: 0n,
      first: network.start,
      last: network.start,
      supported: true,
      description:
        'A /32 identifies one host or host route; it has no separate network/broadcast reservation.',
      warnings: [],
    };
  if (network.prefix === 31) {
    if (policy === 'point-to-point')
      return {
        count: 2n,
        reserved: 0n,
        first: network.start,
        last: network.end,
        supported: true,
        description:
          'RFC 3021 permits both /31 addresses as endpoints on a point-to-point link and eliminates the directed broadcast.',
        warnings: [],
      };
    return {
      count: 0n,
      reserved: 2n,
      first: null,
      last: null,
      supported: false,
      description:
        'The conventional LAN rule leaves no host addresses in a /31. Select the point-to-point policy for the RFC 3021 two-endpoint interpretation.',
      warnings: [
        'A /31 has two usable endpoints on RFC 3021 point-to-point links; it is not a conventional multi-access LAN subnet.',
      ],
    };
  }
  return {
    count: network.size - 2n,
    reserved: 2n,
    first: network.start + 1n,
    last: network.end - 1n,
    supported: true,
    description:
      'The conventional IPv4 LAN rule reserves the network and directed-broadcast addresses.',
    warnings: [],
  };
}

export function smallestPrefix(
  hosts: bigint,
  policy: NetworkPolicy,
  variant: CloudVariant = 'standard',
): number {
  requireCondition(
    hosts > 0n && hosts <= 1n << 32n,
    'Required hosts must be between 1 and 4294967296.',
  );
  readPolicy(policy);
  const limits =
    policy === 'aws' || policy === 'azure' || policy === 'gcp'
      ? cloudLimits[policy]
      : { min: 0, max: policy === 'point-to-point' ? 32 : 30 };
  for (let prefix = limits.max; prefix >= limits.min; prefix -= 1) {
    const candidate = capacity(networkFrom(0n, prefix, 4), policy, variant);
    if (candidate.supported && candidate.count >= hosts) return prefix;
  }
  throw new Error(
    `${hosts} required hosts cannot fit in one supported ${policyNames[policy]} subnet.`,
  );
}
