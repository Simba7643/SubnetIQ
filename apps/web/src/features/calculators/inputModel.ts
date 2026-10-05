import type { ToolId } from '@subnetiq/shared';
import type { ToolDefinition } from './toolDefinitions';

export type DraftInput = Record<string, unknown>;

export function inputText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function inputLines(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : inputText(value).split(/[\n,;]+/);
  return entries
    .map(inputText)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function inputNumber(value: unknown): number {
  if (value === undefined || value === null || inputText(value).trim() === '') return Number.NaN;
  return Number(value);
}

export function freshDefaults(tool: ToolDefinition): DraftInput {
  return JSON.parse(JSON.stringify(tool.defaults)) as DraftInput;
}

export function readToolInput(
  tool: ToolDefinition,
  search: string,
): { input: DraftInput; error?: string } {
  const defaults = freshDefaults(tool);
  const encoded = new URLSearchParams(search).get('input');
  if (!encoded) return { input: defaults };
  if (encoded.length > 65_536)
    return {
      input: defaults,
      error: 'This shared input is too large. Paste the network values directly into the form.',
    };
  try {
    const incoming: unknown = JSON.parse(encoded);
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
      throw new Error('Invalid input');
    const candidate = incoming as Record<string, unknown>;
    const accepted: DraftInput = {};
    for (const key of Object.keys(defaults)) {
      const value = candidate[key];
      if (value === undefined) continue;
      if (key === 'segments') {
        if (!Array.isArray(value) || value.length > 256) throw new Error('Invalid segments');
        accepted[key] = value.map((segment: unknown) => {
          if (!segment || typeof segment !== 'object' || Array.isArray(segment))
            throw new Error('Invalid segment');
          const source = segment as Record<string, unknown>;
          return {
            name: inputText(source.name),
            hosts: inputText(source.hosts),
            growthPercent: inputText(source.growthPercent ?? 0),
            lockedCidr: inputText(source.lockedCidr),
            policy: inputText(source.policy),
            cloudVariant: inputText(source.cloudVariant),
          };
        });
      } else if (key === 'networks' || key === 'reserved') {
        if (typeof value !== 'string' && !Array.isArray(value))
          throw new Error('Invalid network list');
        accepted[key] = inputLines(value);
      } else if (typeof value === 'string' || typeof value === 'number') {
        accepted[key] = value;
      } else {
        throw new Error('Invalid value');
      }
    }
    if (
      tool.id === 'ipv4-map' &&
      candidate.direction === undefined &&
      inputText(candidate.address).includes(':')
    )
      accepted.direction = 'decode';
    return { input: { ...defaults, ...accepted } };
  } catch {
    return {
      input: defaults,
      error: 'The shared input could not be read. The example values are ready for you to edit.',
    };
  }
}

export function segmentDrafts(input: DraftInput): DraftInput[] {
  if (!Array.isArray(input.segments)) return [];
  return input.segments.filter(
    (value): value is DraftInput =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );
}

export function prepareCalculationInput(
  toolId: ToolId,
  draft: DraftInput,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...draft };
  const numericFields: Partial<Record<ToolId, string[]>> = {
    'ipv4-split': ['count'],
    convert: ['fromBase', 'toBase'],
    'netmask-table': ['min', 'max'],
    'ipv6-plan': ['prefix', 'count'],
    bandwidth: ['size', 'speed', 'efficiency'],
    mtu: ['mtu', 'ipVersion', 'tcpOptions', 'encapsulation', 'ipOptions', 'extensionHeaders'],
  };
  for (const name of numericFields[toolId] ?? []) input[name] = inputNumber(draft[name]);
  if (toolId === 'ipv4-split') {
    if (inputText(draft.prefix).trim()) input.prefix = inputNumber(draft.prefix);
    else delete input.prefix;
  }
  if (toolId === 'wildcard' && !inputText(draft.mask).trim()) delete input.mask;
  if (toolId === 'ipv4-subnet' && !inputText(draft.parent).trim()) delete input.parent;
  if (toolId === 'aggregate' || toolId === 'overlap') input.networks = inputLines(draft.networks);
  if (toolId === 'ipv6-plan') input.reserved = inputLines(draft.reserved);
  if (toolId === 'vlsm') {
    input.reserved = inputLines(draft.reserved);
    input.segments = segmentDrafts(draft).map((segment) => ({
      name: inputText(segment.name).trim(),
      hosts: inputNumber(segment.hosts),
      growthPercent: inputNumber(segment.growthPercent ?? 0),
      ...(inputText(segment.lockedCidr).trim()
        ? { lockedCidr: inputText(segment.lockedCidr).trim() }
        : {}),
      ...(inputText(segment.policy).trim() ? { policy: inputText(segment.policy) } : {}),
      ...(inputText(segment.cloudVariant).trim()
        ? { cloudVariant: inputText(segment.cloudVariant) }
        : {}),
    }));
  }
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === 'string' && name !== 'value') input[name] = value.trim();
  }
  return input;
}
