import { toolIds, type CalculationResult, type ToolId } from '@subnetiq/shared';
import { calculateBandwidth, calculateMTU } from './capacity-tools.js';
import { calculateClassification } from './classification.js';
import { requireCondition } from './core.js';
import {
  calculateConvert,
  calculateEUI64,
  calculateMAC,
  calculateReverseDNS,
  calculateWildcard,
} from './helpers.js';
import { calculateIPv4Split, calculateIPv6Plan, calculateVLSM } from './planners.js';
import {
  calculateAggregate,
  calculateCidrToRange,
  calculateOverlap,
  calculateRangeToCidr,
} from './ranges.js';
import {
  calculateIPv4Subnet,
  calculateIPv6Format,
  calculateIPv6Subnet,
  calculateNetmaskTable,
} from './subnets.js';
import { calculateIPv4Map } from './transitions.js';

export {
  parseIPv4,
  formatIPv4,
  parseIPv6,
  formatIPv6,
  expandIPv6,
  parseIP,
  formatIP,
  parseNetwork,
  networkFrom,
  prefixMask,
  contains,
  intersects,
  rangeToNetworks,
  mergeIntervals,
  subtractIntervals,
  PREVIEW_LIMIT,
  MAX4,
  MAX6,
} from './core.js';
export type { Family, IPAddress, Network, Interval } from './core.js';
export {
  classifyAddress,
  classifyNetwork,
  historicalClass,
  isGlobalUnicast,
} from './classification.js';
export { capacity, smallestPrefix, policyNames, policySources } from './policies.js';
export type { CloudVariant, Capacity } from './policies.js';
export { parseMAC } from './helpers.js';
export { aggregateNetworks } from './ranges.js';
export { encodeNAT64, decodeNAT64 } from './transitions.js';
export { REGISTRY_VERSION, REGISTRY_REVIEWED_AT } from './registry.js';

const calculators: Record<ToolId, (input: Record<string, unknown>) => CalculationResult> = {
  'ipv4-subnet': calculateIPv4Subnet,
  'ipv4-split': calculateIPv4Split,
  vlsm: calculateVLSM,
  aggregate: calculateAggregate,
  'range-to-cidr': calculateRangeToCidr,
  'cidr-to-range': calculateCidrToRange,
  overlap: calculateOverlap,
  wildcard: calculateWildcard,
  convert: calculateConvert,
  classify: calculateClassification,
  'reverse-dns': calculateReverseDNS,
  'netmask-table': calculateNetmaskTable,
  'ipv6-subnet': calculateIPv6Subnet,
  'ipv6-format': calculateIPv6Format,
  eui64: calculateEUI64,
  'ipv6-plan': calculateIPv6Plan,
  'ipv4-map': calculateIPv4Map,
  bandwidth: calculateBandwidth,
  mtu: calculateMTU,
  mac: calculateMAC,
};

export function calculate(
  toolId: ToolId | string,
  input: Record<string, unknown>,
): CalculationResult {
  requireCondition(
    typeof toolId === 'string' && (toolIds as readonly string[]).includes(toolId),
    `Unknown tool. Supported tool IDs: ${toolIds.join(', ')}.`,
  );
  requireCondition(
    input !== null && typeof input === 'object' && !Array.isArray(input),
    'Calculation input must be an object containing the tool fields.',
  );
  return calculators[toolId as ToolId](input);
}
