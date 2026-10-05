import { describe, expect, it } from 'vitest';
import { calculate } from '@subnetiq/netcalc';
import { toolIds, type ToolId } from '@subnetiq/shared';
import { prepareCalculationInput, readToolInput } from './inputModel';
import { searchTools, toolById, toolDefinitions } from './toolDefinitions';

describe('calculator input contracts', () => {
  it('provides exactly one discoverable tool for every supported calculator', () => {
    expect(toolDefinitions.map((tool) => tool.id).sort()).toEqual([...toolIds].sort());
    expect(new Set(toolDefinitions.map((tool) => tool.id)).size).toBe(toolIds.length);
    expect(searchTools('nat64').map((tool) => tool.id)).toContain('ipv4-map');
    expect(searchTools('ipv6', 'Planning').map((tool) => tool.id)).toContain('ipv6-plan');
  });

  it.each(toolDefinitions.map((tool) => [tool.id, tool] as const))(
    'calculates and reopens the %s example without changing the result',
    (_id, tool) => {
      const original = calculate(tool.id, prepareCalculationInput(tool.id, tool.defaults));
      expect(original.summary.length).toBeGreaterThan(0);
      expect(original.steps.length).toBeGreaterThan(0);
      const restored = readToolInput(
        tool,
        `?input=${encodeURIComponent(JSON.stringify(original.normalizedInput))}`,
      );
      expect(restored.error).toBeUndefined();
      const reopened = calculate(tool.id, prepareCalculationInput(tool.id, restored.input));
      expect(reopened.summary).toEqual(original.summary);
      expect(reopened.blocks).toEqual(original.blocks);
    },
  );

  const advancedInputs: [ToolId, Record<string, unknown>][] = [
    [
      'ipv4-subnet',
      { address: '10.2.3.4/24', parent: '10.0.0.0/8', policy: 'aws', cloudVariant: 'byoip' },
    ],
    ['ipv4-split', { network: '10.0.0.0/8', count: 4096, prefix: 20, startIndex: '512' }],
    [
      'vlsm',
      {
        network: '10.0.0.0/24',
        policy: 'aws',
        segments: [
          {
            name: 'Application',
            hosts: 64,
            growthPercent: 0,
            cloudVariant: 'byoip',
            lockedCidr: '10.0.0.0/26',
          },
        ],
        reserved: ['10.0.0.128/27', '10.0.0.160/27'],
      },
    ],
    ['netmask-table', { min: 24, max: 28, policy: 'gcp', cloudVariant: 'secondary' }],
    [
      'ipv4-map',
      { address: '64:ff9b::c000:221', mode: 'nat64', direction: 'decode', prefix: '64:ff9b::/96' },
    ],
    ['ipv6-plan', { network: '::/0', prefix: 128, count: 4, startIndex: '9007199254740993' }],
    [
      'ipv6-plan',
      {
        network: '2001:db8:1200::/48',
        prefix: 64,
        count: 16,
        startIndex: '0',
        reserved: ['2001:db8:1200::/80'],
      },
    ],
    [
      'mtu',
      {
        mtu: 1500,
        ipVersion: 6,
        tcpOptions: 12,
        encapsulation: 80,
        ipOptions: 0,
        extensionHeaders: 16,
      },
    ],
  ];

  it.each(advancedInputs)(
    'preserves advanced %s inputs in a shared calculation',
    (toolId, input) => {
      const tool = toolById.get(toolId)!;
      const original = calculate(toolId, input);
      const restored = readToolInput(
        tool,
        `?input=${encodeURIComponent(JSON.stringify(original.normalizedInput))}`,
      );
      expect(restored.error).toBeUndefined();
      const reopened = calculate(toolId, prepareCalculationInput(toolId, restored.input));
      expect(reopened.summary).toEqual(original.summary);
      expect(reopened.blocks).toEqual(original.blocks);
    },
  );

  it('opens a template with defaulted reservations and growth settings', () => {
    const tool = toolById.get('vlsm')!;
    const restored = readToolInput(
      tool,
      `?input=${encodeURIComponent(JSON.stringify({ network: '172.16.0.0/16', segments: [{ name: 'Office', hosts: 500 }] }))}`,
    );
    expect(
      calculate('vlsm', prepareCalculationInput('vlsm', restored.input)).blocks?.[0]?.cidr,
    ).toBe('172.16.0.0/23');
  });

  it('accepts pasted network lists separated by newlines, commas, and semicolons', () => {
    const input = prepareCalculationInput('aggregate', {
      networks: '10.0.0.0/26, 10.0.0.64/26;\n10.0.0.128/25\n',
      mode: 'exact',
    });
    const result = calculate('aggregate', input);
    expect(result.rows?.[0]?.cidr).toBe('10.0.0.0/24');
  });

  it('shows a useful fallback for malformed shared input', () => {
    const tool = toolById.get('ipv4-subnet')!;
    const result = readToolInput(tool, '?input=%7Bbroken');
    expect(result.error).toMatch(/could not be read/);
    expect(result.input).toEqual(tool.defaults);
    expect(result.input).not.toBe(tool.defaults);
  });

  it('does not turn a blank required numeric field into zero or keep a stale valid result', () => {
    const tool = toolById.get('bandwidth')!;
    const input = prepareCalculationInput(tool.id, { ...tool.defaults, speed: '' });
    expect(() => calculate(tool.id, input)).toThrow();
  });

  it('infers the decode direction when opening an older mapped-address link', () => {
    const tool = toolById.get('ipv4-map')!;
    const restored = readToolInput(
      tool,
      `?input=${encodeURIComponent(JSON.stringify({ address: '::ffff:192.0.2.33', mode: 'mapped' }))}`,
    );
    const result = calculate(tool.id, prepareCalculationInput(tool.id, restored.input));
    expect(result.data?.result).toBe('192.0.2.33');
  });
});
