import {
  capacity,
  formatIP,
  networkFrom,
  parseIP,
  parseNetwork,
  type CloudVariant,
  type Family,
} from '@subnetiq/netcalc';
import {
  ENGINE_VERSION,
  type CalculationResult,
  type NetworkPolicy,
  type Project,
} from '@subnetiq/shared';
import { csvCell } from '@/lib/export';

export interface PlanNetwork extends Record<string, unknown> {
  id: string;
  name: string;
  cidr: string;
  ipv6: string;
  vlan: number | null;
  gateway: string;
  purpose: string;
  notes: string;
  locked: boolean;
  reserved: boolean;
  growthPercent: number;
  parentId: string;
  policy: NetworkPolicy;
  cloudVariant: CloudVariant;
}

export interface ProjectDraft {
  name: string;
  description: string;
  address_space: string;
  plan: Record<string, unknown>;
  archived: boolean;
}

export interface Revision {
  id: string;
  project_id: string;
  name: string;
  snapshot: Project;
  created_at: string;
}

export interface ProjectShare {
  id: string;
  project_id?: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
  token?: string;
  url?: string;
}

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const primitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

export function isCalculation(value: unknown): value is CalculationResult {
  if (
    !record(value) ||
    typeof value.toolId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.engineVersion !== 'string' ||
    !record(value.normalizedInput)
  )
    return false;
  if (
    !Array.isArray(value.summary) ||
    !value.summary.every(
      (field) =>
        record(field) &&
        typeof field.label === 'string' &&
        primitive(field.value) &&
        (field.description === undefined || typeof field.description === 'string'),
    )
  )
    return false;
  if (
    !Array.isArray(value.steps) ||
    !value.steps.every(
      (step) =>
        record(step) &&
        typeof step.title === 'string' &&
        typeof step.description === 'string' &&
        (step.formula === undefined || typeof step.formula === 'string'),
    )
  )
    return false;
  if (
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === 'string')
  )
    return false;
  if (
    value.columns !== undefined &&
    (!Array.isArray(value.columns) ||
      !value.columns.every(
        (column) =>
          record(column) && typeof column.key === 'string' && typeof column.label === 'string',
      ))
  )
    return false;
  if (
    value.rows !== undefined &&
    (!Array.isArray(value.rows) ||
      !value.rows.every((row) => record(row) && Object.values(row).every(primitive)))
  )
    return false;
  if (
    value.sources !== undefined &&
    (!Array.isArray(value.sources) || !value.sources.every((source) => typeof source === 'string'))
  )
    return false;
  return true;
}

export function normalizeNetwork(value: unknown, index = 0): PlanNetwork {
  if (!record(value)) throw new Error(`Network ${index + 1} must be an object.`);
  if (
    (value.locked !== undefined && typeof value.locked !== 'boolean') ||
    (value.reserved !== undefined && typeof value.reserved !== 'boolean')
  )
    throw new Error(`Network ${index + 1}: locked and reserved settings must be true or false.`);
  const primary = text(value.cidr, text(value.ipv4, text(value.network)));
  const secondary = text(value.ipv6);
  return {
    ...value,
    id: text(value.id, `network-${index + 1}`),
    name: text(value.name, `Network ${index + 1}`),
    cidr: primary || secondary,
    ipv6: primary ? secondary : '',
    vlan:
      value.vlan === null ||
      value.vlan === '' ||
      (value.vlan === undefined && value.vlanId === undefined)
        ? null
        : Number(value.vlan ?? value.vlanId),
    gateway: text(value.gateway),
    purpose: text(value.purpose),
    notes: text(value.notes),
    locked: value.locked === true,
    reserved: value.reserved === true || /^Reserved \d+$/.test(text(value.name)),
    growthPercent: Number(value.growthPercent ?? value.growth_percent ?? 0),
    parentId: text(value.parentId, text(value.parent_id)),
    policy: text(value.policy, 'lan') as NetworkPolicy,
    cloudVariant: text(value.cloudVariant, 'standard') as CloudVariant,
  };
}

export function planNetworks(plan: Record<string, unknown>): PlanNetwork[] {
  const result = isCalculation(plan.result) ? plan.result : undefined;
  const entries = Array.isArray(plan.networks)
    ? plan.networks
    : Array.isArray(result?.data?.networks)
      ? result.data.networks
      : (result?.blocks ?? []);
  return entries.map(normalizeNetwork);
}

export function validateNetworks(networks: PlanNetwork[]): PlanNetwork[] {
  if (networks.length > 1000)
    throw new Error(
      'A project can contain at most 1,000 network rows. Split larger plans into projects.',
    );
  const ids = new Set<string>();
  const validated = networks.map((network, index) => {
    if (!network.name.trim() || network.name.length > 100)
      throw new Error(`Network ${index + 1} needs a name of 1–100 characters.`);
    if (!network.id || ids.has(network.id)) throw new Error('Each network needs a unique ID.');
    ids.add(network.id);
    const parsed = parseNetwork(network.cidr);
    if (!['lan', 'point-to-point', 'aws', 'azure', 'gcp'].includes(network.policy))
      throw new Error(`${network.name}: choose a supported allocation policy.`);
    if (network.ipv6 && (parsed.family !== 4 || parseNetwork(network.ipv6).family !== 6))
      throw new Error(`${network.name}: pair an IPv4 network with an IPv6 prefix.`);
    if (
      network.vlan !== null &&
      (!Number.isInteger(network.vlan) || network.vlan < 1 || network.vlan > 4094)
    )
      throw new Error(`${network.name}: VLAN must be 1–4094 or empty.`);
    if (
      !Number.isFinite(network.growthPercent) ||
      network.growthPercent < 0 ||
      network.growthPercent > 10000
    )
      throw new Error(`${network.name}: growth must be between 0 and 10,000 percent.`);
    if (network.purpose.length > 500 || network.notes.length > 10000)
      throw new Error(`${network.name}: purpose or notes exceed the project limit.`);
    if (network.gateway) {
      const gateway = parseIP(network.gateway);
      const candidates = [parsed, ...(network.ipv6 ? [parseNetwork(network.ipv6)] : [])];
      if (
        !candidates.some(
          (candidate) =>
            candidate.family === gateway.family &&
            gateway.value >= candidate.start &&
            gateway.value <= candidate.end,
        )
      )
        throw new Error(`${network.name}: the gateway must belong to one of this row's networks.`);
    }
    const available =
      parsed.family === 4
        ? capacity(parsed, network.policy, network.cloudVariant).count
        : parsed.size;
    return {
      ...network,
      name: network.name.trim(),
      cidr: parsed.cidr,
      ipv4: parsed.family === 4 ? parsed.cidr : '',
      ipv6: network.ipv6 ? parseNetwork(network.ipv6).cidr : '',
      start: formatIP(parsed.start, parsed.family),
      end: formatIP(parsed.end, parsed.family),
      size: parsed.size.toString(),
      capacity: available.toString(),
    };
  });
  for (const network of validated) {
    if (!network.parentId) continue;
    const parent = validated.find((candidate) => candidate.id === network.parentId);
    if (!parent || parent.id === network.id)
      throw new Error(`${network.name}: choose a different network in this project as its parent.`);
    const parentCidr = parseNetwork(parent.cidr);
    const childCidr = parseNetwork(network.cidr);
    if (
      parentCidr.family !== childCidr.family ||
      parentCidr.prefix >= childCidr.prefix ||
      parentCidr.start > childCidr.start ||
      parentCidr.end < childCidr.end
    )
      throw new Error(`${network.name}: its parent must strictly contain the allocation.`);
  }
  return validated;
}

export function planCalculations(plan: Record<string, unknown>): CalculationResult[] {
  const values = [
    ...(isCalculation(plan.result) ? [plan.result] : []),
    ...(Array.isArray(plan.calculations) ? plan.calculations.filter(isCalculation) : []),
  ];
  const unique = new Map<string, CalculationResult>();
  for (const calculation of values)
    unique.set(JSON.stringify([calculation.toolId, calculation.normalizedInput]), calculation);
  return [...unique.values()];
}

export function planFromCalculation(calculation: CalculationResult): Record<string, unknown> {
  const plan = {
    schemaVersion: 1,
    kind: calculation.toolId,
    input: calculation.normalizedInput,
    result: calculation,
  };
  const allocations = Array.isArray(calculation.data?.allocations)
    ? calculation.data.allocations.filter(record)
    : [];
  return {
    ...plan,
    networks: planNetworks(plan).map((network) => {
      const allocation = allocations.find((entry) => entry.name === network.name);
      return normalizeNetwork({
        ...network,
        policy: allocation?.policy ?? calculation.normalizedInput.policy ?? network.policy,
        cloudVariant:
          allocation?.cloudVariant ??
          calculation.normalizedInput.cloudVariant ??
          network.cloudVariant,
      });
    }),
  };
}

export function projectDraft(project: Project): ProjectDraft {
  return {
    name: project.name,
    description: project.description,
    address_space: project.address_space,
    plan: project.plan,
    archived: Boolean(project.archived),
  };
}

export function validateDraft(draft: ProjectDraft): ProjectDraft {
  if (!draft.name.trim() || draft.name.length > 100)
    throw new Error('Give this project a name of 1–100 characters.');
  if (draft.description.length > 3000)
    throw new Error('Project notes must be at most 3,000 characters.');
  if (!draft.address_space.trim() || draft.address_space.length > 100)
    throw new Error('Address-space context must be 1–100 characters.');
  if (!record(draft.plan)) throw new Error('A project plan must be a JSON object.');
  const networks = validateNetworks(planNetworks(draft.plan));
  const plan = { ...draft.plan, networks };
  if (new TextEncoder().encode(JSON.stringify(plan)).length > 2_097_152)
    throw new Error('The plan exceeds the 2 MiB project limit. Split it into smaller projects.');
  return { ...draft, name: draft.name.trim(), address_space: draft.address_space.trim(), plan };
}

export function parseProjectJson(source: string): ProjectDraft {
  if (new TextEncoder().encode(source).length > 2_200_000)
    throw new Error('Choose a JSON file smaller than 2.2 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('The file is not valid JSON. Check its syntax and try again.');
  }
  if (!record(parsed)) throw new Error('Import a project or plan represented by a JSON object.');
  const value = record(parsed.project) ? parsed.project : parsed;
  if (isCalculation(value))
    return validateDraft({
      name: value.title.slice(0, 100),
      description: '',
      address_space: 'default',
      archived: false,
      plan: planFromCalculation(value),
    });
  if ('plan' in value && !record(value.plan))
    throw new Error('The imported project plan must be a JSON object.');
  const plan = record(value.plan) ? value.plan : value;
  return validateDraft({
    name: text(value.name, 'Imported project'),
    description: text(value.description),
    address_space: text(value.address_space, 'default'),
    plan,
    archived: false,
  });
}

export function parseNetworkCsv(source: string): PlanNetwork[] {
  if (new TextEncoder().encode(source).length > 2_200_000)
    throw new Error('Choose a CSV file smaller than 2.2 MB.');
  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const input = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else field += char;
    } else if (char === '"') {
      if (field || closedQuote) throw new Error('CSV quotes must surround a complete field.');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(field);
      if (row.some((entry) => entry.trim())) table.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else {
      if (closedQuote && char.trim()) throw new Error('Unexpected text after a quoted CSV field.');
      if (!closedQuote) field += char;
    }
  }
  if (quoted) throw new Error('A quoted CSV field is not closed.');
  row.push(field);
  if (row.some((entry) => entry.trim())) table.push(row);
  const headers =
    table.shift()?.map((header) =>
      header
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
    ) ?? [];
  if (
    !headers.includes('name') ||
    !headers.some((header) => ['cidr', 'ipv4', 'network', 'ipv6'].includes(header))
  )
    throw new Error('CSV needs a Name column and a CIDR, IPv4, Network, or IPv6 column.');
  if (new Set(headers).size !== headers.length)
    throw new Error('CSV column headings must be unique.');
  const boolean = (value: string | undefined) => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['', 'false', 'no', '0'].includes(normalized)) return false;
    throw new Error('CSV Locked and Reserved fields must be true or false.');
  };
  const networks = table.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}.`,
      );
    const values = Object.fromEntries(
      headers.map((header, column) => [header, cells[column] ?? '']),
    );
    return normalizeNetwork(
      {
        ...values,
        id: values.id || `import-${index + 1}`,
        cidr: values.cidr || values.ipv4 || values.network,
        ipv6: values.ipv6,
        vlan: values.vlan || values.vlanid || null,
        locked: boolean(values.locked),
        reserved: boolean(values.reserved),
        growthPercent: values.growthpercent || 0,
        parentId: values.parentid || '',
        policy: values.policy || 'lan',
        cloudVariant: values.cloudvariant || 'standard',
      },
      index,
    );
  });
  if (!networks.length) throw new Error('The CSV contains headings but no network rows.');
  return validateNetworks(networks);
}

export function networkCsv(networks: PlanNetwork[]) {
  const headings = [
    'ID',
    'Name',
    'CIDR',
    'IPv6',
    'VLAN',
    'Gateway',
    'Purpose',
    'Notes',
    'Locked',
    'Reserved',
    'Growth percent',
    'Parent ID',
    'Policy',
    'Cloud variant',
  ];
  const rows = networks.map((network) => [
    network.id,
    network.name,
    network.cidr,
    network.ipv6,
    network.vlan,
    network.gateway,
    network.purpose,
    network.notes,
    network.locked,
    network.reserved,
    network.growthPercent,
    network.parentId,
    network.policy,
    network.cloudVariant,
  ]);
  return [headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function projectReport(project: Project): CalculationResult {
  const networks = planNetworks(project.plan);
  return {
    toolId: 'project-plan',
    title: project.name,
    engineVersion: ENGINE_VERSION,
    normalizedInput: { projectId: project.id, version: project.version },
    summary: [
      { label: 'Address-space context', value: project.address_space },
      { label: 'Version', value: project.version },
      { label: 'Network rows', value: networks.length },
      { label: 'Project notes', value: project.description },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'cidr', label: 'CIDR' },
      { key: 'ipv6', label: 'IPv6 pair' },
      { key: 'vlan', label: 'VLAN' },
      { key: 'gateway', label: 'Gateway' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'notes', label: 'Notes' },
      { key: 'locked', label: 'Locked' },
      { key: 'reserved', label: 'Reserved' },
      { key: 'growth', label: 'Growth %' },
      { key: 'parent', label: 'Parent' },
    ],
    rows: networks.map((network) => ({
      name: network.name,
      cidr: network.cidr,
      ipv6: network.ipv6,
      vlan: network.vlan,
      gateway: network.gateway,
      purpose: network.purpose,
      notes: network.notes,
      locked: network.locked,
      reserved: network.reserved,
      growth: network.growthPercent,
      parent: networks.find((candidate) => candidate.id === network.parentId)?.name ?? '',
    })),
    steps: [
      {
        title: 'Saved project snapshot',
        description: `Created ${project.created_at}; last saved ${project.updated_at}. Address-space contexts identify where overlapping private ranges may intentionally be reused.`,
      },
    ],
    warnings: [
      'Review gateway, routing, DHCP, DNS, firewall, and capacity settings for the intended network before applying this plan.',
    ],
  };
}

export function mapResult(networks: PlanNetwork[], family: Family) {
  const entries = networks
    .flatMap((network) =>
      [network.cidr, ...(network.ipv6 ? [network.ipv6] : [])].map((cidr) => ({
        row: network,
        parsed: parseNetwork(cidr),
      })),
    )
    .filter((entry) => entry.parsed.family === family);
  if (!entries.length) return null;
  let start = entries[0].parsed.start;
  let end = entries[0].parsed.end;
  for (const entry of entries) {
    if (entry.parsed.start < start) start = entry.parsed.start;
    if (entry.parsed.end > end) end = entry.parsed.end;
  }
  let prefix = family === 4 ? 32 : 128;
  for (let difference = start ^ end; difference > 0n; difference >>= 1n) prefix--;
  const parent = networkFrom(start, prefix, family);
  const result: CalculationResult = {
    toolId: family === 6 ? 'ipv6-plan' : 'project-plan',
    title: `IPv${family} address space`,
    engineVersion: ENGINE_VERSION,
    normalizedInput: {},
    summary: [],
    steps: [],
    warnings: [],
    blocks: entries.map(({ row: network, parsed }) => ({
      name: network.name,
      cidr: parsed.cidr,
      start: formatIP(parsed.start, family),
      end: formatIP(parsed.end, family),
      size: parsed.size.toString(),
      locked: network.locked,
      color: network.reserved ? '#7c879e' : undefined,
    })),
  };
  return {
    result,
    input: {
      network: parent.cidr,
      reserved: entries.filter((entry) => entry.row.reserved).map((entry) => entry.parsed.cidr),
    },
  };
}

export function revisionChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const previous = planNetworks(before);
  const current = planNetworks(after);
  const identity = (network: PlanNetwork) => network.id || network.name;
  const oldRows = new Map(previous.map((network) => [identity(network), network]));
  const newRows = new Map(current.map((network) => [identity(network), network]));
  return {
    added: current.filter((network) => !oldRows.has(identity(network))),
    removed: previous.filter((network) => !newRows.has(identity(network))),
    changed: current.filter(
      (network) =>
        oldRows.has(identity(network)) &&
        comparable(oldRows.get(identity(network))!) !== comparable(network),
    ),
  };
}

function comparable(network: PlanNetwork) {
  const aliases = new Set([
    'ipv4',
    'network',
    'vlanId',
    'growth_percent',
    'parent_id',
    'start',
    'end',
    'size',
    'capacity',
  ]);
  const sortValue = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sortValue)
      : record(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sortValue(value[key])]),
          )
        : value;
  return JSON.stringify(
    sortValue(Object.fromEntries(Object.entries(network).filter(([key]) => !aliases.has(key)))),
  );
}

export const filename = (name: string) =>
  `subnetiq-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'project'
  }`;
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
