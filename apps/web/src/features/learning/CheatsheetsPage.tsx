import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Printer } from 'lucide-react';
import { calculate } from '@subnetiq/netcalc';
import type { CalculationResult } from '@subnetiq/shared';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import ResultPanel from '@/components/ResultPanel';
import ports from '@data/ports.json';
import './learning.css';

const layers = [
  {
    number: 7,
    layer: 'Application',
    tcpip: 'Application',
    purpose: 'Application semantics',
    examples: 'HTTP, DNS, SMTP, SSH',
  },
  {
    number: 6,
    layer: 'Presentation',
    tcpip: 'Application',
    purpose: 'Representation and transformation',
    examples: 'Encoding, serialization, encryption formats',
  },
  {
    number: 5,
    layer: 'Session',
    tcpip: 'Application',
    purpose: 'Dialog and session management',
    examples: 'Application dialog/session functions',
  },
  {
    number: 4,
    layer: 'Transport',
    tcpip: 'Transport',
    purpose: 'Endpoint communication',
    examples: 'TCP, UDP; QUIC over UDP',
  },
  {
    number: 3,
    layer: 'Network',
    tcpip: 'Internet',
    purpose: 'Addressing and routed delivery',
    examples: 'IPv4, IPv6, ICMP',
  },
  {
    number: 2,
    layer: 'Data link',
    tcpip: 'Link',
    purpose: 'Local link framing',
    examples: 'Ethernet MAC, 802.1Q VLANs',
  },
  {
    number: 1,
    layer: 'Physical',
    tcpip: 'Link',
    purpose: 'Signals and media',
    examples: 'Copper, fiber, radio',
  },
];
const rangeRows = [
  {
    prefix: '10.0.0.0/8',
    purpose: 'RFC 1918 private',
    range: '10.0.0.0–10.255.255.255',
    note: 'Reusable internally; interconnection can expose overlaps.',
  },
  {
    prefix: '172.16.0.0/12',
    purpose: 'RFC 1918 private',
    range: '172.16.0.0–172.31.255.255',
    note: 'Only second octets 16–31; not all of 172/8.',
  },
  {
    prefix: '192.168.0.0/16',
    purpose: 'RFC 1918 private',
    range: '192.168.0.0–192.168.255.255',
    note: 'Contains 256 separate /24 networks.',
  },
  {
    prefix: '100.64.0.0/10',
    purpose: 'RFC 6598 shared',
    range: '100.64.0.0–100.127.255.255',
    note: 'Provider shared space, distinct from RFC 1918.',
  },
  {
    prefix: '169.254.0.0/16',
    purpose: 'IPv4 link-local',
    range: '169.254.0.0–169.254.255.255',
    note: 'Single link; endpoint selection has RFC 3927 restrictions.',
  },
  {
    prefix: '127.0.0.0/8',
    purpose: 'IPv4 loopback',
    range: '127.0.0.0–127.255.255.255',
    note: 'Local host; not ordinary routed addressing.',
  },
  {
    prefix: '192.0.2.0/24',
    purpose: 'Documentation',
    range: '192.0.2.0–192.0.2.255',
    note: 'One of three IPv4 documentation /24s.',
  },
  {
    prefix: '198.51.100.0/24',
    purpose: 'Documentation',
    range: '198.51.100.0–198.51.100.255',
    note: 'For examples, not production assignment.',
  },
  {
    prefix: '203.0.113.0/24',
    purpose: 'Documentation',
    range: '203.0.113.0–203.0.113.255',
    note: 'For examples, not production assignment.',
  },
  {
    prefix: 'fe80::/10',
    purpose: 'IPv6 link-local',
    range: 'One-link scope',
    note: 'Specify the interface/zone when needed.',
  },
  {
    prefix: 'fc00::/7',
    purpose: 'IPv6 unique local',
    range: 'Locally generated assignments use fd00::/8',
    note: 'Generate a suitable random global ID; avoid predictable collisions.',
  },
  {
    prefix: '2001:db8::/32',
    purpose: 'IPv6 documentation',
    range: 'Documentation examples',
    note: 'Replace with an assigned prefix before deployment.',
  },
];
function reference(
  title: string,
  toolId: string,
  rows: CalculationResult['rows'],
  columns: CalculationResult['columns'],
  notes: string[],
  sources: string[],
): CalculationResult {
  return {
    toolId,
    title,
    normalizedInput: {},
    summary: [{ label: 'Entries', value: rows?.length ?? 0 }],
    rows,
    columns,
    warnings: notes,
    steps: [],
    sources,
    engineVersion: '1.0.0',
  };
}

export default function CheatsheetsPage() {
  const [sheet, setSheet] = useState('cidr');
  const [prefixMin, setPrefixMin] = useState('0');
  const [prefixMax, setPrefixMax] = useState('32');
  const [policy, setPolicy] = useState('lan');
  const computed = useMemo(() => {
    try {
      if (sheet === 'cidr') {
        if (!/^\d+$/.test(prefixMin) || !/^\d+$/.test(prefixMax))
          throw new Error('Enter whole-number prefix bounds from 0 through 32.');
        if (Number(prefixMin) > Number(prefixMax))
          throw new Error('The first prefix cannot be greater than the last.');
        return {
          result: calculate('netmask-table', {
            min: Number(prefixMin),
            max: Number(prefixMax),
            policy,
          }),
          error: '',
        };
      }
      if (sheet === 'binary')
        return {
          result: reference(
            'Powers of two and octet weights',
            'cheatsheet-binary',
            Array.from({ length: 33 }, (_, power) => ({
              power,
              expression: `2^${power}`,
              value: (1n << BigInt(power)).toString(),
              use:
                power < 8
                  ? `Octet weight ${2 ** power}`
                  : power === 8
                    ? 'Patterns in one octet'
                    : power === 16
                      ? 'Patterns in one hextet'
                      : power === 32
                        ? 'Total IPv4 addresses'
                        : 'Address or subnet combinations',
            })),
            [
              { key: 'power', label: 'Power' },
              { key: 'expression', label: 'Expression' },
              { key: 'value', label: 'Exact value' },
              { key: 'use', label: 'Connection' },
            ],
            [
              'An unsigned octet has 256 values numbered 0–255. A byte is eight bits; do not confuse MB with Mb.',
              'For a child-prefix difference d, the number of equal children is 2^d.',
            ],
            ['https://www.rfc-editor.org/rfc/rfc4632'],
          ),
          error: '',
        };
      if (sheet === 'ranges')
        return {
          result: reference(
            'Private and selected special-purpose ranges',
            'cheatsheet-ranges',
            rangeRows,
            [
              { key: 'prefix', label: 'Prefix' },
              { key: 'purpose', label: 'Purpose' },
              { key: 'range', label: 'Range / scope' },
              { key: 'note', label: 'Planning note' },
            ],
            [
              'This is a selected reference, not the complete special-purpose registry. Nonprivate does not mean globally reachable or available for your use.',
            ],
            [
              'https://www.rfc-editor.org/rfc/rfc1918',
              'https://www.rfc-editor.org/rfc/rfc6598',
              'https://www.iana.org/assignments/iana-ipv4-special-registry/',
              'https://www.iana.org/assignments/iana-ipv6-special-registry/',
            ],
          ),
          error: '',
        };
      if (sheet === 'ports')
        return {
          result: reference(
            'Common service ports',
            'cheatsheet-ports',
            ports.map(({ port, transport, service, security }) => ({
              port,
              transport,
              service,
              security,
            })),
            [
              { key: 'port', label: 'Port' },
              { key: 'transport', label: 'Transport' },
              { key: 'service', label: 'Service' },
              { key: 'security', label: 'Security note' },
            ],
            [
              'A port number does not prove which application is running. TCP and UDP registrations and behavior differ.',
              'System ports: 0–1023; user ports: 1024–49151; dynamic/private: 49152–65535. Operating-system ephemeral selection ranges may differ.',
            ],
            ['https://www.iana.org/assignments/service-names-port-numbers/'],
          ),
          error: '',
        };
      return {
        result: reference(
          'OSI and TCP/IP models',
          'cheatsheet-layers',
          layers,
          [
            { key: 'number', label: 'OSI layer' },
            { key: 'layer', label: 'Name' },
            { key: 'tcpip', label: 'TCP/IP grouping' },
            { key: 'purpose', label: 'Purpose' },
            { key: 'examples', label: 'Examples' },
          ],
          [
            'The four-layer TCP/IP grouping is a teaching model; some references use five layers. Real protocols do not always map neatly to one OSI layer.',
            'TCP/IP commonly groups OSI application, presentation, and session functions together. TLS placement depends on the abstraction being discussed.',
          ],
          ['https://www.rfc-editor.org/rfc/rfc1122', 'https://www.rfc-editor.org/rfc/rfc1123'],
        ),
        error: '',
      };
    } catch (failure) {
      return {
        result: null,
        error: failure instanceof Error ? failure.message : 'Could not create this reference.',
      };
    }
  }, [sheet, prefixMin, prefixMax, policy]);
  return (
    <div className="page learning-page">
      <PageHeader
        eyebrow="Keep the essentials close"
        title="Your networking desk reference."
        description="Exact tables, clear assumptions, and readable exports. Print a sheet or take it into your next study session."
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print this sheet
          </Button>
        }
      />
      <Card className="stack no-print">
        <div className="row cheatsheet-tabs" role="group" aria-label="Choose a cheat sheet">
          {[
            ['cidr', 'CIDR & masks'],
            ['binary', 'Powers of two'],
            ['ranges', 'Private & special ranges'],
            ['ports', 'Common ports'],
            ['layers', 'OSI & TCP/IP'],
          ].map(([id, title]) => (
            <Button
              key={id}
              variant={sheet === id ? 'primary' : 'ghost'}
              aria-pressed={sheet === id}
              onClick={() => setSheet(id!)}
            >
              {title}
            </Button>
          ))}
        </div>
        {sheet === 'cidr' && (
          <div className="grid-3">
            <Field label="First prefix">
              <Input
                type="number"
                min={0}
                max={32}
                value={prefixMin}
                onChange={(event) => setPrefixMin(event.target.value)}
              />
            </Field>
            <Field label="Last prefix">
              <Input
                type="number"
                min={0}
                max={32}
                value={prefixMax}
                onChange={(event) => setPrefixMax(event.target.value)}
              />
            </Field>
            <Field label="Capacity policy">
              <Select value={policy} onChange={(event) => setPolicy(event.target.value)}>
                <option value="lan">Conventional LAN</option>
                <option value="point-to-point">Point-to-point</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                <option value="gcp">Google Cloud</option>
              </Select>
            </Field>
          </div>
        )}
      </Card>
      <section className="section">
        {computed.error ? (
          <div className="error-banner" role="alert">
            {computed.error}
          </div>
        ) : (
          computed.result && <ResultPanel result={computed.result} />
        )}
      </section>
      <Card className="learning-reference-tip">
        <div className="icon-box">
          <BookOpen size={21} />
        </div>
        <div>
          <Badge>Reference becomes understanding</Badge>
          <h3>Know why the table works.</h3>
          <p className="muted">
            Learn the bit arithmetic, special-prefix exceptions, and operational rules behind the
            numbers.
          </p>
          <Link to="/learn/cidr" className="button button-ghost">
            Explore the CIDR lesson
            <ArrowRight size={15} />
          </Link>
        </div>
      </Card>
    </div>
  );
}
