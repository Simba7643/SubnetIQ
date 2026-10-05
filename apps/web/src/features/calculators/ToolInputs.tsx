import { useId, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  LockKeyhole,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import { calculate, formatIPv4, MAX4, parseNetwork, PREVIEW_LIMIT } from '@subnetiq/netcalc';
import type { ToolId } from '@subnetiq/shared';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import {
  inputLines,
  inputNumber,
  inputText,
  prepareCalculationInput,
  segmentDrafts,
  type DraftInput,
} from './inputModel';

interface FormProps {
  draft: DraftInput;
  onChange: (key: string, value: unknown) => void;
}

interface ControlProps extends FormProps {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number | 'any';
  maxLength?: number;
}

function TextControl({
  draft,
  onChange,
  name,
  label,
  hint,
  placeholder,
  type = 'text',
  min,
  max,
  step,
  maxLength,
}: ControlProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint}>
      <Input
        id={id}
        aria-label={label}
        name={name}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={inputText(draft[name])}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength ?? 512}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        dir={name === 'name' ? undefined : 'ltr'}
      />
    </Field>
  );
}

interface SelectControlProps extends FormProps {
  name: string;
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
}

function SelectControl({ draft, onChange, name, label, hint, options }: SelectControlProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint}>
      <Select
        id={id}
        aria-label={label}
        value={inputText(draft[name])}
        onChange={(event) => onChange(name, event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ListControl({
  draft,
  onChange,
  name,
  label,
  hint,
  placeholder,
  rows = 5,
}: ControlProps & { rows?: number }) {
  const id = useId();
  const value = draft[name];
  return (
    <Field label={label} hint={hint}>
      <Textarea
        id={id}
        aria-label={label}
        name={name}
        value={Array.isArray(value) ? inputLines(value).join('\n') : inputText(value)}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={65_536}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
      />
    </Field>
  );
}

const policyOptions = [
  { value: 'lan', label: 'Conventional LAN' },
  { value: 'point-to-point', label: 'Point-to-point / RFC 3021' },
  { value: 'aws', label: 'AWS subnet reservations' },
  { value: 'azure', label: 'Azure subnet reservations' },
  { value: 'gcp', label: 'Google Cloud subnet reservations' },
];

function PolicyControl(props: FormProps & { inherit?: boolean; label?: string }) {
  return (
    <SelectControl
      {...props}
      name="policy"
      label={props.label ?? 'Address capacity policy'}
      hint={
        props.inherit
          ? undefined
          : 'Capacity follows the selected reservation rules; the mathematical address count stays exact.'
      }
      options={
        props.inherit
          ? [{ value: '', label: 'Inherit the plan policy' }, ...policyOptions]
          : policyOptions
      }
      onChange={(key, value) => {
        props.onChange(key, value);
        if ('cloudVariant' in props.draft || props.inherit)
          props.onChange('cloudVariant', 'standard');
      }}
    />
  );
}

function CloudVariantControl(props: FormProps & { inheritedPolicy?: unknown; label?: string }) {
  const policy = inputText(props.draft.policy) || inputText(props.inheritedPolicy);
  const isCloud = policy === 'aws' || policy === 'gcp';
  if (!isCloud && (!props.draft.cloudVariant || props.draft.cloudVariant === 'standard'))
    return null;
  return (
    <SelectControl
      {...props}
      name="cloudVariant"
      label={props.label ?? 'Provider allocation variant'}
      options={[
        {
          value: 'standard',
          label:
            policy === 'gcp'
              ? 'Primary range · standard reservations'
              : 'Standard address reservations',
        },
        ...(policy === 'aws' ? [{ value: 'byoip', label: 'Bring your own IP · BYOIP' }] : []),
        ...(policy === 'gcp' ? [{ value: 'secondary', label: 'Secondary IPv4 range' }] : []),
      ]}
      hint="Choose a variant only when it matches the provider configuration."
    />
  );
}

function InputNote({ children }: { children: ReactNode }) {
  return (
    <div className="calculator-input-note">
      <Info size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function ExampleChips({
  values,
  onSelect,
}: {
  values: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <div className="calculator-example-chips" role="group" aria-label="Example values">
      <span>Try</span>
      {values.map((value) => (
        <button type="button" key={value} onClick={() => onSelect(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}

function SplitInputs(props: FormProps) {
  const [method, setMethod] = useState(inputText(props.draft.prefix).trim() ? 'prefix' : 'count');
  const switchMethod = (value: string) => {
    setMethod(value);
    props.onChange('startIndex', '0');
    if (value === 'count') props.onChange('prefix', '');
    else {
      let prefix: number;
      try {
        prefix = Math.min(32, parseNetwork(inputText(props.draft.network)).prefix + 2);
      } catch {
        prefix = 26;
      }
      props.onChange('prefix', prefix);
    }
  };
  let previousIndex: string | null = null;
  let nextIndex: string | null = null;
  try {
    const count = inputNumber(props.draft.count);
    const indexText = inputText(props.draft.startIndex);
    if (!Number.isSafeInteger(count) || count < 1 || !/^\d+$/.test(indexText))
      throw new Error('Invalid preview');
    const index = BigInt(indexText);
    const step = BigInt(PREVIEW_LIMIT);
    if (index > 0n) previousIndex = (index >= step ? index - step : 0n).toString();
    if (index + step < BigInt(count)) nextIndex = (index + step).toString();
  } catch {
    previousIndex = null;
    nextIndex = null;
  }
  return (
    <>
      <TextControl
        {...props}
        name="network"
        label="Parent IPv4 network"
        placeholder="192.168.10.0/24"
      />
      <Field label="Split method">
        <Select
          aria-label="Split method"
          value={method}
          onChange={(event) => switchMethod(event.target.value)}
        >
          <option value="count">Split the whole network equally</option>
          <option value="prefix">Allocate at a target prefix</option>
        </Select>
      </Field>
      {method === 'prefix' && (
        <TextControl
          {...props}
          name="prefix"
          label="Target prefix length"
          type="number"
          min={0}
          max={32}
          step={1}
          hint="Enter the prefix length without the slash, such as 26."
        />
      )}
      <TextControl
        {...props}
        name="count"
        label={method === 'prefix' ? 'Networks to allocate' : 'Number of equal subnets'}
        type="number"
        min={1}
        max={4_294_967_296}
        step={1}
        hint={
          method === 'prefix'
            ? 'A fixed prefix can leave some of the parent network unallocated.'
            : 'Use a power of two: 1, 2, 4, 8, 16, and so on.'
        }
      />
      {(inputNumber(props.draft.count) > PREVIEW_LIMIT ||
        inputText(props.draft.startIndex) !== '0') && (
        <>
          <TextControl
            {...props}
            name="startIndex"
            label="First subnet preview index"
            hint={`Zero-based offset. Each preview displays up to ${PREVIEW_LIMIT} allocated networks.`}
          />
          <div
            className="calculator-preview-navigation"
            role="group"
            aria-label="IPv4 split preview navigation"
          >
            <Button
              variant="secondary"
              disabled={previousIndex === null}
              onClick={() => {
                if (previousIndex !== null) props.onChange('startIndex', previousIndex);
              }}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={nextIndex === null}
              onClick={() => {
                if (nextIndex !== null) props.onChange('startIndex', nextIndex);
              }}
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
      <InputNote>
        Large splits retain exact totals and return a bounded allocation preview.
      </InputNote>
    </>
  );
}

function SegmentEditor({
  segment,
  index,
  onChange,
  onRemove,
  removable,
  inheritedPolicy,
}: {
  segment: DraftInput;
  index: number;
  onChange: (key: string, value: unknown) => void;
  onRemove: () => void;
  removable: boolean;
  inheritedPolicy: unknown;
}) {
  const [expanded, setExpanded] = useState(
    Boolean(
      segment.lockedCidr ||
      segment.policy ||
      (segment.cloudVariant && segment.cloudVariant !== 'standard') ||
      inputNumber(segment.growthPercent) > 0,
    ),
  );
  const optionsId = useId();
  const props = { draft: segment, onChange };
  return (
    <fieldset className="calculator-segment">
      <legend>Segment {index + 1}</legend>
      <div className="calculator-segment-heading">
        <span className="calculator-segment-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="calculator-segment-name">
          {inputText(segment.name) || 'Unnamed segment'}
        </span>
        {inputText(segment.lockedCidr) && <LockKeyhole size={14} aria-label="Locked allocation" />}
        <Button
          variant="ghost"
          aria-label={`Remove segment ${index + 1}`}
          disabled={!removable}
          onClick={onRemove}
        >
          <Trash2 size={15} aria-hidden="true" />
        </Button>
      </div>
      <div className="calculator-segment-main">
        <TextControl {...props} name="name" label={`Segment ${index + 1} name`} maxLength={100} />
        <TextControl
          {...props}
          name="hosts"
          label={`Segment ${index + 1} hosts`}
          type="number"
          min={1}
          max={4_294_967_296}
          step={1}
        />
      </div>
      <button
        type="button"
        className="calculator-options-toggle"
        aria-expanded={expanded}
        aria-controls={optionsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Settings2 size={14} aria-hidden="true" />
        Growth, placement & policy
        <ChevronDown size={14} aria-hidden="true" className={expanded ? 'rotated' : ''} />
      </button>
      {expanded && (
        <div id={optionsId} className="calculator-segment-options">
          <TextControl
            {...props}
            name="growthPercent"
            label={`Segment ${index + 1} growth (%)`}
            type="number"
            min={0}
            max={1000}
            step={0.01}
            hint="Extra capacity to reserve for this segment."
          />
          <TextControl
            {...props}
            name="lockedCidr"
            label={`Segment ${index + 1} locked CIDR`}
            placeholder="Optional, such as 192.168.10.0/25"
            hint="Keep an existing block in its current position."
          />
          <PolicyControl {...props} inherit label={`Segment ${index + 1} capacity policy`} />
          <CloudVariantControl
            {...props}
            inheritedPolicy={inheritedPolicy}
            label={`Segment ${index + 1} provider variant`}
          />
        </div>
      )}
    </fieldset>
  );
}

function VlsmInputs(props: FormProps) {
  const segments = segmentDrafts(props.draft);
  const [reservationsOpen, setReservationsOpen] = useState(
    inputLines(props.draft.reserved).length > 0,
  );
  const reservationsId = useId();
  const updateSegment = (index: number, key: string, value: unknown) =>
    props.onChange(
      'segments',
      segments.map((segment, row) => (row === index ? { ...segment, [key]: value } : segment)),
    );
  return (
    <>
      <TextControl
        {...props}
        name="network"
        label="Parent IPv4 network"
        placeholder="192.168.10.0/24"
      />
      <PolicyControl
        {...props}
        onChange={(key, value) => {
          props.onChange(key, value);
          if (key === 'policy')
            props.onChange(
              'segments',
              segments.map((segment) =>
                segment.policy ? segment : { ...segment, cloudVariant: 'standard' },
              ),
            );
        }}
      />
      <div className="calculator-segments-header">
        <div>
          <h3>Network segments</h3>
          <span className="muted">
            {segments.length} named {segments.length === 1 ? 'allocation' : 'allocations'}
          </span>
        </div>
        <Button
          variant="secondary"
          disabled={segments.length >= 256}
          onClick={() =>
            props.onChange('segments', [
              ...segments,
              { name: `Segment ${segments.length + 1}`, hosts: 16, growthPercent: 0 },
            ])
          }
        >
          <Plus size={15} aria-hidden="true" /> Add segment
        </Button>
      </div>
      <div className="calculator-segments">
        {segments.map((segment, index) => (
          <SegmentEditor
            key={index}
            segment={segment}
            index={index}
            onChange={(key, value) => updateSegment(index, key, value)}
            onRemove={() =>
              props.onChange(
                'segments',
                segments.filter((_, row) => row !== index),
              )
            }
            removable={segments.length > 1}
            inheritedPolicy={props.draft.policy}
          />
        ))}
      </div>
      <div className="calculator-reservations">
        <button
          type="button"
          className="calculator-options-toggle"
          aria-expanded={reservationsOpen}
          aria-controls={reservationsId}
          onClick={() => setReservationsOpen((value) => !value)}
        >
          <LockKeyhole size={15} aria-hidden="true" /> Reserve address space
          {inputLines(props.draft.reserved).length > 0 && (
            <span className="badge">{inputLines(props.draft.reserved).length}</span>
          )}
          <ChevronDown size={14} aria-hidden="true" className={reservationsOpen ? 'rotated' : ''} />
        </button>
        {reservationsOpen && (
          <div id={reservationsId}>
            <ListControl
              {...props}
              name="reserved"
              label="Reserved CIDR blocks"
              rows={3}
              placeholder="192.168.10.240/28"
              hint="One CIDR per line. Reserved blocks are excluded from new allocations."
            />
          </div>
        )}
      </div>
      <InputNote>
        Hosts are endpoints required under each segment’s policy. Growth rounds up before sizing.
        Locked CIDRs and reservations must fit within the parent network.
      </InputNote>
    </>
  );
}

function Ipv6PlanInputs(props: FormProps) {
  let previousIndex: string | null = null;
  let nextIndex: string | null = null;
  try {
    const parent = parseNetwork(inputText(props.draft.network));
    const prefix = inputNumber(props.draft.prefix);
    const count = inputNumber(props.draft.count);
    const indexText = inputText(props.draft.startIndex);
    if (
      !/^\d+$/.test(indexText) ||
      !Number.isInteger(prefix) ||
      prefix < parent.prefix ||
      prefix > 128 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 256
    )
      throw new Error('Invalid preview');
    const index = BigInt(indexText);
    const amount = BigInt(count);
    const total = 1n << BigInt(prefix - parent.prefix);
    if (index > 0n) previousIndex = (index > amount ? index - amount : 0n).toString();
    if (index + amount < total) nextIndex = (index + amount).toString();
  } catch {
    previousIndex = null;
    nextIndex = null;
  }
  return (
    <>
      <TextControl
        {...props}
        name="network"
        label="Parent IPv6 allocation"
        placeholder="2001:db8:1200::/48"
      />
      <TextControl
        {...props}
        name="prefix"
        label="Child prefix length"
        type="number"
        min={0}
        max={128}
        step={1}
        hint="A /48 contains 65,536 /64 networks."
      />
      <div
        className="calculator-example-chips"
        role="group"
        aria-label="Common IPv6 child prefixes"
      >
        <span>Common</span>
        {[48, 56, 60, 64].map((prefix) => (
          <button key={prefix} type="button" onClick={() => props.onChange('prefix', prefix)}>
            /{prefix}
          </button>
        ))}
      </div>
      <TextControl
        {...props}
        name="count"
        label="Networks per preview"
        type="number"
        min={1}
        max={256}
        step={1}
        hint="Show 1–256 child networks at a time."
      />
      <TextControl
        {...props}
        name="startIndex"
        label="First child index"
        hint="Zero-based decimal offset. Large offsets keep their exact integer value."
      />
      <div
        className="calculator-preview-navigation"
        role="group"
        aria-label="IPv6 allocation preview navigation"
      >
        <Button
          variant="secondary"
          disabled={previousIndex === null}
          onClick={() => {
            if (previousIndex !== null) props.onChange('startIndex', previousIndex);
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </Button>
        <Button
          variant="secondary"
          disabled={nextIndex === null}
          onClick={() => {
            if (nextIndex !== null) props.onChange('startIndex', nextIndex);
          }}
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <ListControl
        {...props}
        name="reserved"
        label="Reserved IPv6 prefixes (optional)"
        rows={3}
        placeholder="2001:db8:1200:100::/56"
        hint="One CIDR per line. A child that overlaps a reservation is marked unavailable."
      />
      <InputNote>
        The preview is a window into the allocation. The full child-network count is exact, even
        when the range is too large to enumerate.
      </InputNote>
    </>
  );
}

function IPv4SubnetInputs(props: FormProps) {
  let previous: string | null = null;
  let next: string | null = null;
  try {
    const network = parseNetwork(inputText(props.draft.address), 4);
    if (network.start >= network.size)
      previous = `${formatIPv4(network.start - network.size)}/${network.prefix}`;
    if (network.end < MAX4) next = `${formatIPv4(network.end + 1n)}/${network.prefix}`;
  } catch {
    previous = null;
    next = null;
  }
  return (
    <>
      <TextControl
        {...props}
        name="address"
        label="IPv4 address / prefix"
        placeholder="192.168.10.42/24"
        hint="A host address is accepted; the network boundary is calculated for you."
      />
      <ExampleChips
        values={['10.10.8.7/22', '192.0.2.4/31', '203.0.113.8/32']}
        onSelect={(value) => props.onChange('address', value)}
      />
      <PolicyControl {...props} />
      <CloudVariantControl {...props} />
      <TextControl
        {...props}
        name="parent"
        label="Parent network (optional)"
        placeholder="For example, 192.168.0.0/16"
        hint="Add a containing network to calculate borrowed bits relative to that parent."
      />
      <div
        className="calculator-preview-navigation"
        role="group"
        aria-label="Adjacent IPv4 subnets"
      >
        <Button
          variant="secondary"
          aria-label="Previous IPv4 subnet"
          disabled={previous === null}
          onClick={() => {
            if (previous !== null) props.onChange('address', previous);
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous subnet
        </Button>
        <Button
          variant="secondary"
          aria-label="Next IPv4 subnet"
          disabled={next === null}
          onClick={() => {
            if (next !== null) props.onChange('address', next);
          }}
        >
          Next subnet
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <InputNote>
        Choose point-to-point policy for an RFC 3021 /31 link. A /32 represents one host route.
      </InputNote>
    </>
  );
}

function MappingInputs(props: FormProps) {
  const decoding = props.draft.direction === 'decode';
  const changeDirection = (_key: string, value: unknown) => {
    try {
      const result = calculate('ipv4-map', prepareCalculationInput('ipv4-map', props.draft));
      const nextAddress = result.data?.[value === 'decode' ? 'ipv6' : 'ipv4'];
      if (typeof nextAddress === 'string') props.onChange('address', nextAddress);
    } catch {
      props.onChange('address', inputText(props.draft.address));
    }
    props.onChange('direction', value);
  };
  return (
    <>
      <SelectControl
        {...props}
        name="mode"
        label="Mapping format"
        options={[
          { value: 'mapped', label: 'IPv4-mapped IPv6' },
          { value: 'nat64', label: 'NAT64 encoding' },
          { value: '6to4', label: '6to4 · historical format' },
        ]}
      />
      <SelectControl
        {...props}
        onChange={changeDirection}
        name="direction"
        label="Conversion direction"
        options={[
          { value: 'encode', label: 'Encode · IPv4 to IPv6' },
          { value: 'decode', label: 'Decode · extract embedded IPv4' },
        ]}
      />
      <TextControl
        {...props}
        name="address"
        label={decoding ? 'IPv6 mapping address' : 'IPv4 address'}
        placeholder={decoding ? '::ffff:192.0.2.33' : '192.0.2.33'}
      />
      {props.draft.mode === 'nat64' && (
        <TextControl
          {...props}
          name="prefix"
          label="NAT64 translation prefix"
          placeholder="64:ff9b::/96"
          hint="RFC 6052 supports /32, /40, /48, /56, /64, and /96 prefix lengths."
        />
      )}
      <InputNote>
        {props.draft.mode === '6to4'
          ? '6to4 is included for reading historical network configurations and learning the address format.'
          : props.draft.mode === 'nat64'
            ? 'Encoding an address does not deploy a translator. Prefix layout and the translation infrastructure must match.'
            : 'An IPv4-mapped value represents an IPv4 address in an IPv6 address structure; it is not a native IPv6 allocation.'}
      </InputNote>
    </>
  );
}

const baseOptions = [
  { value: '2', label: 'Binary · base 2' },
  { value: '8', label: 'Octal · base 8' },
  { value: '10', label: 'Decimal · base 10' },
  { value: '16', label: 'Hexadecimal · base 16' },
];

export default function ToolInputs({ toolId, ...props }: FormProps & { toolId: ToolId }) {
  switch (toolId) {
    case 'ipv4-subnet':
      return <IPv4SubnetInputs {...props} />;
    case 'ipv4-split':
      return <SplitInputs {...props} />;
    case 'vlsm':
      return <VlsmInputs {...props} />;
    case 'aggregate':
      return (
        <>
          <ListControl
            {...props}
            name="networks"
            label="Networks to summarize"
            placeholder="192.168.10.0/25\n192.168.10.128/25"
            hint="Enter one CIDR per line, or separate entries with commas."
          />
          <SelectControl
            {...props}
            name="mode"
            label="Aggregation mode"
            options={[
              { value: 'exact', label: 'Exact · preserve the same addresses' },
              { value: 'cover', label: 'Cover · smallest single supernet' },
            ]}
          />
          <InputNote>
            {props.draft.mode === 'cover'
              ? 'A covering summary may include addresses outside the input networks. Review the extra space before using it as a route or policy.'
              : 'Exact aggregation merges only aligned adjacent blocks and removes redundant contained ranges.'}
          </InputNote>
        </>
      );
    case 'range-to-cidr':
      return (
        <>
          <TextControl
            {...props}
            name="start"
            label="First address (inclusive)"
            placeholder="192.168.10.10"
          />
          <TextControl
            {...props}
            name="end"
            label="Last address (inclusive)"
            placeholder="192.168.10.99"
          />
          <InputNote>
            Both endpoints must use the same address family. The result covers every address in the
            range exactly once.
          </InputNote>
        </>
      );
    case 'cidr-to-range':
      return (
        <>
          <TextControl
            {...props}
            name="network"
            label="IPv4 or IPv6 network"
            placeholder="192.168.10.64/26"
          />
          <ExampleChips
            values={['10.0.0.0/8', '2001:db8::/48', '192.0.2.1/32']}
            onSelect={(value) => props.onChange('network', value)}
          />
          <InputNote>
            This is the complete mathematical address range, including any addresses reserved by a
            deployment policy.
          </InputNote>
        </>
      );
    case 'overlap':
      return (
        <>
          <ListControl
            {...props}
            name="networks"
            label="Networks to check"
            rows={7}
            placeholder="10.0.0.0/24\n10.0.0.128/25\n10.0.1.0/24"
            hint="One CIDR per line. Include networks from the same routing or address-space context."
          />
          <InputNote>
            Reusing a private range in separate, isolated routing domains can be intentional. Check
            each context separately.
          </InputNote>
        </>
      );
    case 'wildcard':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="IPv4 address or CIDR"
            placeholder="192.168.10.0/24"
          />
          <TextControl
            {...props}
            name="mask"
            label="Wildcard mask (optional)"
            placeholder="Derived from the prefix when blank"
            hint="Enter wildcard notation, such as 0.0.0.255, rather than a subnet mask."
          />
          <InputNote>
            Wildcard zero bits must match. Wildcard one bits are ignored. Noncontiguous masks
            require the matching explanation rather than a single CIDR.
          </InputNote>
        </>
      );
    case 'convert':
      return (
        <>
          <TextControl
            {...props}
            name="value"
            label="Integer or dotted octets"
            placeholder="11000000"
            maxLength={4096}
          />
          <SelectControl {...props} name="fromBase" label="Input base" options={baseOptions} />
          <SelectControl {...props} name="toBase" label="Output base" options={baseOptions} />
          <InputNote>
            Integer arithmetic preserves exact digits. Dotted input converts four independent
            octets, each from 0 to 255; binary octets are padded to eight bits.
          </InputNote>
        </>
      );
    case 'classify':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="IP address or CIDR"
            placeholder="100.64.0.1"
          />
          <ExampleChips
            values={['192.168.1.1', '100.64.0.1', '2001:db8::1']}
            onSelect={(value) => props.onChange('address', value)}
          />
          <InputNote>
            Purpose and global reachability are separate registry attributes. A large CIDR can span
            more than one classification.
          </InputNote>
        </>
      );
    case 'reverse-dns':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="IP address or prefix"
            placeholder="192.0.2.10"
          />
          <ExampleChips
            values={['192.0.2.0/24', '2001:db8::1', '2001:db8::/48']}
            onSelect={(value) => props.onChange('address', value)}
          />
          <InputNote>
            A host reverse name identifies a PTR lookup. Delegating authority for a prefix is a
            separate DNS configuration task.
          </InputNote>
        </>
      );
    case 'netmask-table':
      return (
        <>
          <div className="calculator-input-pair">
            <TextControl
              {...props}
              name="min"
              label="First prefix"
              type="number"
              min={0}
              max={32}
              step={1}
            />
            <TextControl
              {...props}
              name="max"
              label="Last prefix"
              type="number"
              min={0}
              max={32}
              step={1}
            />
          </div>
          <PolicyControl {...props} />
          <CloudVariantControl {...props} />
          <InputNote>
            Use the table for quick comparisons, then open the subnet calculator to inspect a
            specific address.
          </InputNote>
        </>
      );
    case 'ipv6-subnet':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="IPv6 address / prefix"
            placeholder="2001:db8:1234:5678::1/64"
          />
          <ExampleChips
            values={['2001:db8::/48', '2001:db8::/127', '::1/128']}
            onSelect={(value) => props.onChange('address', value)}
          />
          <InputNote>
            IPv6 has no broadcast address. Address counts are exact across the full /0–/128 range.
          </InputNote>
        </>
      );
    case 'ipv6-format':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="IPv6 address"
            placeholder="2001:0db8:0000:0000:0000:ff00:0042:8329"
          />
          <ExampleChips
            values={['2001:db8::1', '::ffff:192.0.2.1', '::']}
            onSelect={(value) => props.onChange('address', value)}
          />
          <InputNote>
            Canonical output suppresses leading zeros and uses a single longest zero run according
            to RFC 5952.
          </InputNote>
        </>
      );
    case 'eui64':
      return (
        <>
          <TextControl
            {...props}
            name="mac"
            label="48-bit MAC address"
            placeholder="00:1A:2B:3C:4D:5E"
          />
          <TextControl {...props} name="prefix" label="IPv6 /64 prefix" placeholder="fe80::/64" />
          <InputNote>
            This demonstrates modified EUI-64. A MAC-derived identifier is stable and can have
            privacy implications; IPv6 hosts can use other identifier methods.
          </InputNote>
        </>
      );
    case 'ipv6-plan':
      return <Ipv6PlanInputs {...props} />;
    case 'ipv4-map':
      return <MappingInputs {...props} />;
    case 'bandwidth':
      return (
        <>
          <div className="calculator-input-pair">
            <TextControl
              {...props}
              name="size"
              label="Transfer size"
              type="number"
              min={0}
              step="any"
            />
            <SelectControl
              {...props}
              name="sizeUnit"
              label="Size unit"
              options={['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </div>
          <div className="calculator-input-pair">
            <TextControl
              {...props}
              name="speed"
              label="Link speed"
              type="number"
              min={0}
              step="any"
            />
            <SelectControl
              {...props}
              name="speedUnit"
              label="Speed unit"
              options={['bps', 'Kbps', 'Mbps', 'Gbps'].map((value) => ({ value, label: value }))}
            />
          </div>
          <TextControl
            {...props}
            name="efficiency"
            label="Transfer efficiency (%)"
            type="number"
            min={0.01}
            max={100}
            step="any"
            hint="100% is the ideal line-rate estimate. Lower values account for expected overhead and utilization."
          />
          <InputNote>
            KB, MB, GB, and TB use powers of 1,000. KiB, MiB, and GiB use powers of 1,024. Network
            rates are in bits per second.
          </InputNote>
        </>
      );
    case 'mtu':
      return (
        <>
          <TextControl
            {...props}
            name="mtu"
            label="Outer path MTU (bytes)"
            type="number"
            min={68}
            max={65_535}
            step={1}
          />
          <SelectControl
            {...props}
            name="ipVersion"
            label="IP version"
            options={[
              { value: '4', label: 'IPv4 · 20-byte base header' },
              { value: '6', label: 'IPv6 · 40-byte base header' },
            ]}
            onChange={(key, value) => {
              props.onChange(key, value);
              props.onChange(value === '6' ? 'ipOptions' : 'extensionHeaders', 0);
            }}
          />
          <TextControl
            {...props}
            name="tcpOptions"
            label="TCP options & padding (bytes)"
            type="number"
            min={0}
            max={40}
            step={4}
            hint="Use a multiple of four, from 0 through 40 bytes."
          />
          {inputNumber(props.draft.ipVersion) === 4 ? (
            <TextControl
              {...props}
              name="ipOptions"
              label="IPv4 options & padding (bytes)"
              type="number"
              min={0}
              max={40}
              step={4}
            />
          ) : (
            <TextControl
              {...props}
              name="extensionHeaders"
              label="IPv6 extension headers (bytes)"
              type="number"
              min={0}
              max={65_515}
              step={1}
            />
          )}
          <TextControl
            {...props}
            name="encapsulation"
            label="Encapsulation overhead (bytes)"
            type="number"
            min={0}
            max={65_515}
            step={1}
            hint="Subtract tunnel headers from the outer IP MTU. Ethernet framing is outside an IP MTU."
          />
          <InputNote>
            The base MSS ceiling subtracts fixed IP and TCP headers. Additional options reduce the
            data carried in each packet. The actual path MTU also depends on the network.
          </InputNote>
        </>
      );
    case 'mac':
      return (
        <>
          <TextControl
            {...props}
            name="address"
            label="MAC address"
            placeholder="02:42:ac:11:00:02"
          />
          <ExampleChips
            values={['00:1A:2B:3C:4D:5E', '02:42:ac:11:00:02', 'ff:ff:ff:ff:ff:ff']}
            onSelect={(value) => props.onChange('address', value)}
          />
          <InputNote>
            The local/global bit describes address administration. A locally administered or
            randomized address does not reliably identify a hardware vendor.
          </InputNote>
        </>
      );
  }
}
