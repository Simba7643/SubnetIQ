import { calculate } from '@subnetiq/netcalc';
import type { CalculationResult, SegmentInput } from '@subnetiq/shared';
import type { NetworkTemplate } from './types';

export function templateInput(template: NetworkTemplate) {
  const segments: SegmentInput[] = template.segments.map((segment) => ({
    name: segment.name,
    hosts: segment.hosts,
    growthPercent: segment.growthPercent ?? 0,
    ...(segment.cidr ? { lockedCidr: segment.cidr } : {}),
  }));
  return { network: template.network, segments, policy: template.policy ?? 'lan', reserved: [] };
}

export function calculateTemplate(template: NetworkTemplate): CalculationResult {
  const result = calculate('vlsm', templateInput(template));
  const rows = template.segments.map((segment) => ({
    name: segment.name,
    requested: segment.hosts,
    ipv4: result.blocks?.find((block) => block.name === segment.name)?.cidr ?? segment.cidr ?? '',
    ipv6: segment.ipv6 ?? '',
    vlan: segment.vlan ?? null,
    gateway: segment.gateway ?? '',
    purpose: segment.purpose ?? '',
  }));
  return {
    ...result,
    title: template.name + ' network plan',
    summary: [{ label: 'Template', value: template.name }, ...result.summary],
    rows,
    columns: [
      { key: 'name', label: 'Segment' },
      { key: 'requested', label: 'Hosts' },
      { key: 'ipv4', label: 'IPv4 allocation' },
      { key: 'ipv6', label: 'IPv6 example' },
      { key: 'vlan', label: 'VLAN' },
      { key: 'gateway', label: 'IPv4 gateway' },
      { key: 'purpose', label: 'Purpose' },
    ],
    warnings: [...result.warnings, ...template.notes],
    steps: [
      ...result.steps,
      {
        title: 'Adapt this design to the environment',
        description:
          'Named segments retain their VLAN, purpose, example gateway, and paired IPv6 allocation. The IPv6 examples use documentation space. Review capacity and gateway reservations against the target equipment.',
      },
    ],
    sources: [
      ...new Set([
        ...(result.sources ?? []),
        'https://www.rfc-editor.org/rfc/rfc1918.html',
        'https://www.rfc-editor.org/rfc/rfc3849.html',
      ]),
    ],
    data: { ...result.data, templateId: template.id, networks: rows },
  };
}
