import {
  ArrowDownUp,
  ArrowLeftRight,
  Binary,
  Boxes,
  Cable,
  Calculator,
  Combine,
  Fingerprint,
  Globe2,
  Hash,
  Layers3,
  ListFilter,
  Map as MapIcon,
  Network,
  ScanSearch,
  ShieldCheck,
  Split,
  Timer,
  Waypoints,
  WrapText,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '@subnetiq/shared';

export type ToolCategory = 'IPv4' | 'IPv6' | 'Planning' | 'Utilities';

export interface ToolDefinition {
  id: ToolId;
  title: string;
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  keywords: string[];
  defaults: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    id: 'ipv4-subnet',
    title: 'IPv4 subnet calculator',
    description: 'Find network boundaries, host capacity, masks, and the bits behind every result.',
    category: 'IPv4',
    icon: Calculator,
    keywords: [
      'cidr',
      'broadcast',
      'subnet mask',
      'network address',
      'hosts',
      'binary',
      'aws',
      'azure',
      'gcp',
    ],
    defaults: { address: '192.168.10.42/24', policy: 'lan', cloudVariant: 'standard', parent: '' },
  },
  {
    id: 'ipv4-split',
    title: 'Equal subnet splitter',
    description:
      'Divide an IPv4 network equally or allocate a specific number of fixed-size blocks.',
    category: 'Planning',
    icon: Split,
    keywords: ['flsm', 'borrowed bits', 'split', 'equal', 'subnets'],
    defaults: { network: '192.168.10.0/24', count: 4, prefix: '', startIndex: '0' },
  },
  {
    id: 'vlsm',
    title: 'VLSM planner',
    description:
      'Build a named address plan with growth, reservations, and allocations that stay locked.',
    category: 'Planning',
    icon: Layers3,
    keywords: [
      'variable length',
      'vlan',
      'departments',
      'growth',
      'reservations',
      'allocation',
      'capacity',
    ],
    defaults: {
      network: '192.168.10.0/24',
      policy: 'lan',
      segments: [
        { name: 'Engineering', hosts: 80, growthPercent: 0 },
        { name: 'Operations', hosts: 40, growthPercent: 0 },
        { name: 'Guest', hosts: 20, growthPercent: 0 },
        { name: 'Router link', hosts: 2, growthPercent: 0, policy: 'point-to-point' },
      ],
      reserved: [],
    },
  },
  {
    id: 'aggregate',
    title: 'CIDR aggregation',
    description:
      'Combine adjacent networks exactly or inspect a covering route and its extra space.',
    category: 'Planning',
    icon: Combine,
    keywords: ['summarization', 'supernet', 'route', 'merge', 'exact', 'cover'],
    defaults: { networks: ['192.168.10.0/25', '192.168.10.128/25'], mode: 'exact' },
  },
  {
    id: 'range-to-cidr',
    title: 'IP range to CIDR',
    description: 'Turn an inclusive address range into the smallest exact list of CIDR blocks.',
    category: 'IPv4',
    icon: Boxes,
    keywords: ['ipv6', 'range', 'list', 'minimum', 'cover'],
    defaults: { start: '192.168.10.10', end: '192.168.10.99' },
  },
  {
    id: 'cidr-to-range',
    title: 'CIDR to IP range',
    description: 'Read the full first-to-last address range represented by an IPv4 or IPv6 prefix.',
    category: 'IPv4',
    icon: ArrowLeftRight,
    keywords: ['ipv6', 'first address', 'last address', 'boundaries', 'count'],
    defaults: { network: '192.168.10.64/26' },
  },
  {
    id: 'overlap',
    title: 'Overlap & conflict checker',
    description:
      'Find duplicate, overlapping, and contained networks before a plan becomes a problem.',
    category: 'Planning',
    icon: ScanSearch,
    keywords: ['ipv6', 'duplicate', 'containment', 'conflict', 'validate'],
    defaults: { networks: ['10.0.0.0/24', '10.0.0.128/25', '10.0.1.0/24'] },
  },
  {
    id: 'wildcard',
    title: 'Wildcard & ACL helper',
    description: 'Translate masks into wildcard notation and inspect Cisco ACL address matching.',
    category: 'IPv4',
    icon: ShieldCheck,
    keywords: ['cisco', 'acl', 'inverse mask', 'noncontiguous', 'access list'],
    defaults: { address: '192.168.10.0/24', mask: '' },
  },
  {
    id: 'convert',
    title: 'Number base converter',
    description:
      'Convert exact integers or dotted octets between binary, octal, decimal, and hexadecimal.',
    category: 'Utilities',
    icon: Binary,
    keywords: ['bits', 'base', 'powers of two', 'hex', 'octal', 'decimal'],
    defaults: { value: '11000000', fromBase: 2, toBase: 10 },
  },
  {
    id: 'classify',
    title: 'IP address classifier',
    description:
      'Identify address purpose, special-use ranges, and registry reachability attributes.',
    category: 'IPv4',
    icon: ListFilter,
    keywords: [
      'ipv6',
      'private',
      'public',
      'cg nat',
      'cgnat',
      'apipa',
      'multicast',
      'iana',
      'loopback',
    ],
    defaults: { address: '100.64.0.1' },
  },
  {
    id: 'reverse-dns',
    title: 'Reverse DNS helper',
    description: 'Generate host reverse names and understand prefix delegation boundaries.',
    category: 'Utilities',
    icon: Waypoints,
    keywords: ['ptr', 'in-addr.arpa', 'ip6.arpa', 'delegation', 'nibble', 'ipv6'],
    defaults: { address: '192.0.2.10' },
  },
  {
    id: 'netmask-table',
    title: 'CIDR & netmask table',
    description: 'Compare every IPv4 prefix with its mask, wildcard, address count, and capacity.',
    category: 'IPv4',
    icon: Hash,
    keywords: ['cheat sheet', 'subnet mask', 'lookup', 'hosts', 'prefix'],
    defaults: { min: 0, max: 32, policy: 'lan', cloudVariant: 'standard' },
  },
  {
    id: 'ipv6-subnet',
    title: 'IPv6 subnet calculator',
    description: 'Explore exact 128-bit address ranges, prefix boundaries, and address counts.',
    category: 'IPv6',
    icon: Globe2,
    keywords: ['128-bit', 'prefix', 'subnet', 'bigint', 'network', 'capacity'],
    defaults: { address: '2001:db8:1234:5678::1/64' },
  },
  {
    id: 'ipv6-format',
    title: 'IPv6 expand & compress',
    description: 'Move between complete hextets and canonical compressed IPv6 notation.',
    category: 'IPv6',
    icon: WrapText,
    keywords: ['rfc 5952', 'normalize', 'canonical', 'expand', 'hextets', 'compress'],
    defaults: { address: '2001:0db8:0000:0000:0000:ff00:0042:8329' },
  },
  {
    id: 'eui64',
    title: 'Modified EUI-64',
    description:
      'Follow the insertion and bit flip that derive an interface identifier from a MAC.',
    category: 'IPv6',
    icon: Fingerprint,
    keywords: ['mac', 'interface identifier', 'fffe', 'link-local', 'slaac'],
    defaults: { mac: '00:1A:2B:3C:4D:5E', prefix: 'fe80::/64' },
  },
  {
    id: 'ipv6-plan',
    title: 'IPv6 prefix planner',
    description:
      'Navigate child prefixes in a large allocation with exact offsets and a bounded preview.',
    category: 'Planning',
    icon: MapIcon,
    keywords: ['ipv6', '48', '56', '60', '64', 'sites', 'hierarchy', 'allocation'],
    defaults: {
      network: '2001:db8:1200::/48',
      prefix: 64,
      count: 16,
      startIndex: '0',
      reserved: [],
    },
  },
  {
    id: 'ipv4-map',
    title: 'IPv4 / IPv6 mapping',
    description: 'Inspect IPv4-mapped addresses, NAT64 encoding, and the historical 6to4 format.',
    category: 'IPv6',
    icon: Network,
    keywords: ['mapped', 'nat64', '6to4', 'transition', 'dual stack', 'translation'],
    defaults: {
      address: '192.0.2.33',
      mode: 'mapped',
      direction: 'encode',
      prefix: '64:ff9b::/96',
    },
  },
  {
    id: 'bandwidth',
    title: 'Transfer time calculator',
    description: 'Estimate transfer duration with explicit byte units, link speed, and efficiency.',
    category: 'Utilities',
    icon: Timer,
    keywords: ['bandwidth', 'speed', 'download', 'upload', 'Mbps', 'GiB', 'duration'],
    defaults: { size: 10, sizeUnit: 'GB', speed: 100, speedUnit: 'Mbps', efficiency: 95 },
  },
  {
    id: 'mtu',
    title: 'MTU & MSS calculator',
    description:
      'See the TCP payload budget after IP headers, options, and encapsulation overhead.',
    category: 'Utilities',
    icon: ArrowDownUp,
    keywords: ['mss', 'tcp', 'packet', 'fragmentation', 'headers', 'tunnel', 'payload'],
    defaults: {
      mtu: 1500,
      ipVersion: 4,
      tcpOptions: 0,
      encapsulation: 0,
      ipOptions: 0,
      extensionHeaders: 0,
    },
  },
  {
    id: 'mac',
    title: 'MAC address inspector',
    description:
      'Normalize hardware addresses and inspect their individual/group and local/global bits.',
    category: 'Utilities',
    icon: Cable,
    keywords: ['ethernet', 'oui', 'multicast', 'unicast', 'local', 'hardware', 'vendor'],
    defaults: { address: '02:42:ac:11:00:02' },
  },
];

export const toolCategories: ToolCategory[] = ['IPv4', 'IPv6', 'Planning', 'Utilities'];

export const toolById = new Map(toolDefinitions.map((tool) => [tool.id, tool]));

export function searchTools(query: string, category: ToolCategory | 'All' = 'All') {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return toolDefinitions.filter((tool) => {
    const text = [tool.title, tool.description, tool.category, ...tool.keywords]
      .join(' ')
      .toLocaleLowerCase();
    return (
      (category === 'All' || tool.category === category) &&
      terms.every((term) => text.includes(term))
    );
  });
}
