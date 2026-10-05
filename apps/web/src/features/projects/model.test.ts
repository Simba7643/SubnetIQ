import { describe, expect, it } from 'vitest';
import { calculate } from '@subnetiq/netcalc';
import {
  isCalculation,
  mapResult,
  networkCsv,
  normalizeNetwork,
  parseNetworkCsv,
  parseProjectJson,
  planCalculations,
  planFromCalculation,
  planNetworks,
  revisionChanges,
  validateDraft,
  validateNetworks,
} from './model';

const allocation = (changes: Record<string, unknown> = {}) =>
  normalizeNetwork({ id: 'engineering', name: 'Engineering', cidr: '10.20.0.0/24', ...changes });

describe('project import and allocation integrity', () => {
  it('imports a quoted multiline CSV without losing notes or IPv6 pairing', () => {
    const rows = parseNetworkCsv(
      'Name,CIDR,IPv6,VLAN,Notes,Locked\r\n"Voice, west",10.20.0.0/24,2001:db8:20::/64,20,"Support ""priority"" calls\nand video",true',
    );
    expect(rows[0]).toMatchObject({
      name: 'Voice, west',
      cidr: '10.20.0.0/24',
      ipv6: '2001:db8:20::/64',
      vlan: 20,
      notes: 'Support "priority" calls\nand video',
      locked: true,
    });
  });

  it.each([
    ['Name,CIDR\n"open,10.20.0.0/24', 'not closed'],
    ['Name,CIDR\nEngineering,10.20.0.0/24,extra', 'expected 2'],
    ['Name,CIDR,CIDR\nEngineering,10.20.0.0/24,10.30.0.0/24', 'unique'],
    ['Name,CIDR,Locked\nEngineering,10.20.0.0/24,ture', 'true or false'],
  ])('rejects malformed CSV: %s', (source, message) =>
    expect(() => parseNetworkCsv(source)).toThrow(message),
  );

  it('recomputes exact address geometry and capacity after a CIDR edit', () => {
    const [network] = validateNetworks([
      allocation({ cidr: '10.20.1.9/25', start: '10.20.0.0', end: '10.20.0.255', capacity: '254' }),
    ]);
    expect(network).toMatchObject({
      cidr: '10.20.1.0/25',
      start: '10.20.1.0',
      end: '10.20.1.127',
      size: '128',
      capacity: '126',
    });
  });

  it('retains a cloud calculation policy when it becomes a project', () => {
    const plan = planFromCalculation(
      calculate('ipv4-subnet', { address: '10.20.0.0/24', policy: 'aws' }),
    );
    const [network] = validateNetworks(planNetworks(plan));
    expect(network.policy).toBe('aws');
    expect(network.capacity).toBe('251');
  });

  it('rejects out-of-network gateways and invalid dual-stack pairs', () => {
    expect(() => validateNetworks([allocation({ gateway: '10.99.0.1' })])).toThrow(
      'gateway must belong',
    );
    expect(() => validateNetworks([allocation({ ipv6: '10.20.1.0/24' })])).toThrow('pair an IPv4');
  });

  it('requires a strict parent and unique allocation identities', () => {
    const parent = allocation({ id: 'parent', cidr: '10.20.0.0/16' });
    const child = allocation({ parentId: 'parent' });
    expect(validateNetworks([parent, child])).toHaveLength(2);
    expect(() => validateNetworks([parent, { ...child, cidr: '10.21.0.0/24' }])).toThrow(
      'strictly contain',
    );
    expect(() => validateNetworks([child, child])).toThrow('unique ID');
  });

  it('never silently treats a malformed lock string as an unlocked allocation', () => {
    expect(() => normalizeNetwork({ name: 'Fixed', cidr: '10.0.0.0/24', locked: 'true' })).toThrow(
      'true or false',
    );
  });

  it('imports an exported project without copying its account identity or version', () => {
    const draft = parseProjectJson(
      JSON.stringify({
        schemaVersion: 1,
        project: {
          id: 'old-id',
          owner_id: 'other-owner',
          version: 27,
          name: 'Office',
          description: 'Keep this description',
          address_space: 'vrf-red',
          plan: { networks: [allocation()], custom: { operator: 'Example' } },
        },
      }),
    );
    expect(draft.name).toBe('Office');
    expect(draft.description).toBe('Keep this description');
    expect(draft.plan.custom).toEqual({ operator: 'Example' });
    expect(draft).not.toHaveProperty('owner_id');
    expect(draft).not.toHaveProperty('version');
  });

  it('recognizes a standalone calculator JSON export as a project attachment', () => {
    const result = calculate('ipv4-subnet', { address: '192.0.2.17/27' });
    const draft = parseProjectJson(JSON.stringify(result));
    expect(planNetworks(draft.plan)[0].cidr).toBe('192.0.2.0/27');
    expect(planCalculations(draft.plan)[0].normalizedInput).toEqual(result.normalizedInput);
  });

  it('rejects a malformed plan object instead of importing it as an empty project', () => {
    expect(() => parseProjectJson('{"name":"Office","plan":[]}')).toThrow(
      'plan must be a JSON object',
    );
    expect(() =>
      validateDraft({
        name: 'Office',
        description: '',
        address_space: '',
        archived: false,
        plan: {},
      }),
    ).toThrow('Address-space context');
  });

  it('escapes spreadsheet formula prefixes and preserves quotes and commas', () => {
    const csv = networkCsv([allocation({ name: '=1+1', notes: 'One, "two"' })]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"One, ""two"""');
    expect(parseNetworkCsv(csv)[0].notes).toBe('One, "two"');
  });

  it('preserves a cloud profile and variant through a CSV round trip', () => {
    const rows = validateNetworks([allocation({ policy: 'aws', cloudVariant: 'byoip' })]);
    const imported = parseNetworkCsv(networkCsv(rows));
    expect(imported[0]).toMatchObject({ policy: 'aws', cloudVariant: 'byoip', capacity: '256' });
  });

  it('builds exact IPv6 map counts without lossy JavaScript number conversion', () => {
    const map = mapResult([allocation({ cidr: '::/0' })], 6);
    expect(map?.result.blocks?.[0].size).toBe('340282366920938463463374607431768211456');
    expect(map?.input.network).toBe('::/0');
  });

  it('compares semantic allocation changes without mistaking object key ordering for edits', () => {
    const before = { networks: [allocation({ custom: { a: 1, b: 2 } })] };
    const equivalent = {
      networks: [allocation({ custom: { b: 2, a: 1 }, start: '10.20.0.0', capacity: '254' })],
    };
    expect(revisionChanges(before, equivalent).changed).toHaveLength(0);
    const after = {
      networks: [
        allocation({ cidr: '10.20.1.0/24', custom: { a: 1, b: 2 } }),
        allocation({ id: 'guest', name: 'Guest', cidr: '10.30.0.0/24' }),
      ],
    };
    expect(revisionChanges(before, after)).toMatchObject({
      added: [expect.objectContaining({ id: 'guest' })],
      removed: [],
      changed: [expect.objectContaining({ id: 'engineering' })],
    });
  });

  it('rejects structured content where a calculation summary requires text', () => {
    const result = calculate('ipv4-subnet', { address: '192.0.2.1/24' });
    expect(
      isCalculation({
        ...result,
        summary: [{ label: 'Bad', value: 'x', description: { html: 'unexpected' } }],
      }),
    ).toBe(false);
  });
});
