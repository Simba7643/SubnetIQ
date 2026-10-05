import { useId, useMemo, useState } from 'react';
import { Binary, Check, ChevronDown, LockKeyhole, Map, SlidersHorizontal } from 'lucide-react';
import {
  expandIPv6,
  formatIP,
  formatIPv4,
  parseIP,
  parseIPv4,
  parseIPv6,
  parseNetwork,
} from '@subnetiq/netcalc';
import type { AllocationBlock, CalculationResult } from '@subnetiq/shared';
import { Button, Card } from '@/components/ui';
import { inputLines, inputText } from './inputModel';

export function IPv4BitVisualizer({
  address,
  onChange,
}: {
  address: string;
  onChange: (address: string) => void;
}) {
  const headingId = useId();
  const sliderId = useId();
  let value: bigint;
  let prefix: number;
  try {
    value = parseIPv4(address.split('/')[0] ?? '');
    prefix = parseNetwork(address, 4).prefix;
  } catch {
    return null;
  }
  const bits = value.toString(2).padStart(32, '0');
  const updatePrefix = (nextPrefix: number) => onChange(`${formatIPv4(value)}/${nextPrefix}`);
  const toggleBit = (index: number) =>
    onChange(`${formatIPv4(value ^ (1n << BigInt(31 - index)))}/${prefix}`);

  return (
    <Card className="calculator-visualizer binary-visualizer">
      <div className="calculator-visualizer-header">
        <div>
          <h2 id={headingId}>
            <Binary size={18} aria-hidden="true" /> See the bits
          </h2>
          <p>Toggle any bit to change the address and recalculate.</p>
        </div>
        <span className="calculator-live-label">Interactive</span>
      </div>
      <div className="binary-octets" role="group" aria-labelledby={headingId}>
        {Array.from({ length: 4 }, (_, octet) => {
          const octetBits = bits.slice(octet * 8, octet * 8 + 8);
          return (
            <div className="binary-octet" key={octet}>
              <div className="binary-octet-label">
                <span>Octet {octet + 1}</span>
                <strong>{Number.parseInt(octetBits, 2)}</strong>
              </div>
              <div className="binary-bit-row">
                {Array.from({ length: 8 }, (_, bit) => {
                  const index = octet * 8 + bit;
                  const bitValue = bits[index] === '1';
                  const networkBit = index < prefix;
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`binary-bit ${networkBit ? 'network-bit' : 'host-bit'} ${bitValue ? 'bit-set' : ''}`}
                      aria-label={`Octet ${octet + 1}, bit ${bit + 1}, weight ${2 ** (7 - bit)}, ${networkBit ? 'network' : 'host'} bit`}
                      aria-pressed={bitValue}
                      title={`Weight ${2 ** (7 - bit)} · ${networkBit ? 'network' : 'host'} bit · click to toggle`}
                      onClick={() => toggleBit(index)}
                    >
                      {bitValue ? '1' : '0'}
                    </button>
                  );
                })}
              </div>
              <div className="binary-weights" aria-hidden="true">
                {[128, 64, 32, 16, 8, 4, 2, 1].map((weight) => (
                  <span key={weight}>{weight}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="prefix-control">
        <label htmlFor={sliderId}>
          <SlidersHorizontal size={15} aria-hidden="true" /> Prefix length{' '}
          <strong>/{prefix}</strong>
        </label>
        <input
          id={sliderId}
          aria-label="IPv4 prefix length"
          type="range"
          min={0}
          max={32}
          value={prefix}
          onChange={(event) => updatePrefix(Number(event.target.value))}
        />
        <div className="bit-legend">
          <span>
            <i className="network-dot" />
            {prefix} network bits
          </span>
          <span>
            <i className="host-dot" />
            {32 - prefix} host bits
          </span>
        </div>
      </div>
    </Card>
  );
}

export function IPv6PrefixVisualizer({
  address,
  onChange,
}: {
  address: string;
  onChange: (address: string) => void;
}) {
  const sliderId = useId();
  let prefix: number;
  let groups: string[];
  let plainAddress: string;
  try {
    plainAddress = address.split('/')[0] ?? '';
    groups = expandIPv6(parseIPv6(plainAddress)).split(':');
    prefix = parseNetwork(address, 6).prefix;
  } catch {
    return null;
  }
  return (
    <Card className="calculator-visualizer ipv6-prefix-visualizer">
      <div className="calculator-visualizer-header">
        <div>
          <h2>
            <Binary size={18} aria-hidden="true" /> A 128-bit address
          </h2>
          <p>Eight hextets, each carrying 16 bits.</p>
        </div>
        <span className="calculator-live-label">Interactive</span>
      </div>
      <div className="ipv6-hextets" aria-label="Expanded IPv6 address and prefix boundaries">
        {groups.map((group, index) => {
          const networkBits = Math.max(0, Math.min(16, prefix - index * 16));
          return (
            <div
              key={index}
              className={`ipv6-hextet ${networkBits === 16 ? 'prefix-hextet' : networkBits === 0 ? 'host-hextet' : 'mixed-hextet'}`}
              title={`Hextet ${index + 1}: ${networkBits} prefix bits and ${16 - networkBits} remaining bits`}
            >
              <span>
                Bits {index * 16 + 1}–{index * 16 + 16}
              </span>
              <strong>{group}</strong>
              <small>
                {networkBits === 16
                  ? 'Prefix'
                  : networkBits === 0
                    ? 'Remaining'
                    : `${networkBits} prefix bits`}
              </small>
            </div>
          );
        })}
      </div>
      <div className="prefix-control">
        <label htmlFor={sliderId}>
          <SlidersHorizontal size={15} aria-hidden="true" /> Prefix length{' '}
          <strong>/{prefix}</strong>
        </label>
        <input
          id={sliderId}
          aria-label="IPv6 prefix length"
          type="range"
          min={0}
          max={128}
          value={prefix}
          onChange={(event) => onChange(`${plainAddress}/${event.target.value}`)}
        />
        <div className="bit-legend">
          <span>
            <i className="network-dot" />
            {prefix} prefix bits
          </span>
          <span>
            <i className="host-dot" />
            {128 - prefix} remaining bits
          </span>
        </div>
      </div>
    </Card>
  );
}

interface MapEntry {
  block: AllocationBlock;
  start: bigint;
  end: bigint;
  reserved: boolean;
  unavailable: boolean;
  color: string;
}

const colors = [
  '#32d5c0',
  '#79aafa',
  '#c49af4',
  '#f7b765',
  '#ef829f',
  '#94d477',
  '#60c5e2',
  '#d2b879',
];

function percentage(value: bigint, total: bigint) {
  if (total <= 0n) return 0;
  return Number((value * 100_000_000n) / total) / 1_000_000;
}

export function AllocationVisualizer({
  result,
  input,
}: {
  result: CalculationResult;
  input: Record<string, unknown>;
}) {
  const [view, setView] = useState<'parent' | 'focus'>(
    result.toolId === 'ipv6-plan' ? 'focus' : 'parent',
  );
  const [selectedKey, setSelectedKey] = useState('');
  const [showAll, setShowAll] = useState(false);
  const headingId = useId();
  const map = useMemo(() => {
    try {
      const parent = parseNetwork(inputText(input.network));
      const reservedRanges = Array.isArray(result.data?.reserved)
        ? result.data.reserved.map((range: Record<string, unknown>) => ({
            start: parseIP(inputText(range.start)).value,
            end: parseIP(inputText(range.end)).value,
          }))
        : inputLines(input.reserved).map((cidr) => parseNetwork(cidr));
      const blocks = result.blocks ?? [];
      const isReserved = (block: AllocationBlock) =>
        result.toolId !== 'ipv6-plan' &&
        reservedRanges.some(
          (range) =>
            range.start <= parseIP(block.start).value && range.end >= parseIP(block.end).value,
        );
      const isUnavailable = (block: AllocationBlock) =>
        result.toolId === 'ipv6-plan' &&
        reservedRanges.some(
          (range) =>
            range.start <= parseIP(block.end).value && range.end >= parseIP(block.start).value,
        );
      const entries: MapEntry[] = blocks
        .map((block, index) => ({
          block,
          start: parseIP(block.start).value,
          end: parseIP(block.end).value,
          reserved: isReserved(block),
          unavailable: isUnavailable(block),
          color:
            isReserved(block) || isUnavailable(block)
              ? '#7c879e'
              : block.color || colors[index % colors.length] || colors[0] || '#32d5c0',
        }))
        .filter((entry) => entry.start >= parent.start && entry.end <= parent.end)
        .sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0));
      return { parent, entries };
    } catch {
      return null;
    }
  }, [input, result]);
  if (!map || map.entries.length === 0) return null;

  const { parent, entries } = map;
  const entryKey = (entry: MapEntry) => `${entry.block.cidr}:${entry.block.name}`;
  const selected = entries.find((entry) => entryKey(entry) === selectedKey) ?? entries[0];
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  if (!firstEntry || !lastEntry || !selected) return null;
  const rangeStart = view === 'focus' ? firstEntry.start : parent.start;
  const rangeEnd =
    view === 'focus'
      ? entries.reduce((end, entry) => (entry.end > end ? entry.end : end), lastEntry.end)
      : parent.end;
  const rangeSize = rangeEnd - rangeStart + 1n;
  const visibleEntries = showAll ? entries : entries.slice(0, 16);
  const selectedId = entryKey(selected);
  const truncated = result.data?.truncated === true;
  return (
    <Card className="calculator-visualizer allocation-visualizer">
      <div className="calculator-visualizer-header">
        <div>
          <h2 id={headingId}>
            <Map size={18} aria-hidden="true" /> Address-space map
          </h2>
          <p>
            {parent.cidr} · {entries.length} displayed {entries.length === 1 ? 'block' : 'blocks'}
          </p>
        </div>
        <div className="allocation-view-switch" role="group" aria-label="Address map zoom">
          <button
            type="button"
            aria-pressed={view === 'parent'}
            className={view === 'parent' ? 'active' : ''}
            onClick={() => setView('parent')}
          >
            Whole network
          </button>
          <button
            type="button"
            aria-pressed={view === 'focus'}
            className={view === 'focus' ? 'active' : ''}
            onClick={() => setView('focus')}
          >
            Allocation span
          </button>
        </div>
      </div>
      <div className="allocation-map" role="group" aria-labelledby={headingId}>
        {entries.map((entry) => {
          const left = percentage(entry.start - rangeStart, rangeSize);
          const width = percentage(entry.end - entry.start + 1n, rangeSize);
          return (
            <button
              key={entryKey(entry)}
              type="button"
              className={`allocation-map-block ${entryKey(entry) === selectedId ? 'selected' : ''} ${entry.reserved || entry.unavailable ? 'reserved-block' : ''}`}
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: entry.color }}
              onClick={() => setSelectedKey(entryKey(entry))}
              aria-label={`${entry.block.name}, ${entry.block.cidr}, ${entry.block.size} addresses${entry.reserved ? ', reserved' : entry.unavailable ? ', unavailable: overlaps a reservation' : ''}`}
              aria-pressed={entryKey(entry) === selectedId}
              title={`${entry.block.name} · ${entry.block.cidr} · ${entry.block.size} addresses`}
            >
              {width > 11 && (
                <span>
                  {entry.block.name}
                  <small>/{entry.block.cidr.split('/')[1]}</small>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="allocation-map-axis">
        <code>{formatIP(rangeStart, parent.family)}</code>
        <code>{formatIP(rangeEnd, parent.family)}</code>
      </div>
      <p className="allocation-map-note">
        {view === 'parent'
          ? 'Widths follow the full parent address range.'
          : 'Zoomed to the span of the displayed allocations.'}{' '}
        {truncated
          ? 'This is a partial preview; unshown space may contain further allocations.'
          : 'Hatched space has no displayed allocation.'}{' '}
        {entries.some((entry) => entry.unavailable) &&
          'Gray child prefixes overlap a reservation and are unavailable as a whole. '}
        Select a block below if it is too small to select on the map.
      </p>
      <div className="allocation-map-legend" role="group" aria-label="Select an allocation">
        {visibleEntries.map((entry) => (
          <button
            type="button"
            key={entryKey(entry)}
            className={entryKey(entry) === selectedId ? 'active' : ''}
            aria-pressed={entryKey(entry) === selectedId}
            onClick={() => setSelectedKey(entryKey(entry))}
          >
            <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
            <span>{entry.block.name}</span>
            <code>{entry.block.cidr}</code>
            {entry.block.locked && <LockKeyhole size={13} aria-label="Locked" />}
            {entryKey(entry) === selectedId && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {entries.length > 16 && (
        <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show fewer blocks' : `Show all ${entries.length} blocks`}
          <ChevronDown size={14} aria-hidden="true" className={showAll ? 'rotated' : ''} />
        </Button>
      )}
      <dl className="allocation-selected" aria-live="polite" aria-atomic="true">
        <div>
          <dt>Selected block</dt>
          <dd>
            {selected.block.name}
            {selected.reserved && <span className="badge">Reserved</span>}
            {selected.unavailable && <span className="badge">Unavailable</span>}
          </dd>
        </div>
        <div>
          <dt>CIDR</dt>
          <dd>
            <code>{selected.block.cidr}</code>
          </dd>
        </div>
        <div>
          <dt>First address</dt>
          <dd>
            <code>{selected.block.start}</code>
          </dd>
        </div>
        <div>
          <dt>Last address</dt>
          <dd>
            <code>{selected.block.end}</code>
          </dd>
        </div>
        <div>
          <dt>Total addresses</dt>
          <dd>{BigInt(selected.block.size).toLocaleString()}</dd>
        </div>
        {selected.block.capacity !== undefined && (
          <div>
            <dt>Capacity</dt>
            <dd>{selected.block.capacity}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
