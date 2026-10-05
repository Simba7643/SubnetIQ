import { type FormEvent, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ExternalLink, Search } from 'lucide-react';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import portsData from '../../../../../data/ports.json';
import protocolsData from '../../../../../data/protocols.json';
import threatsData from '../../../../../data/threats.json';
import commandsData from '../../../../../data/commands.json';
import cvssData from '../../../../../data/cvss.json';
import type { CommandEntry, CvssCard, PortEntry, ProtocolEntry, ThreatEntry } from './types';
import { matchesQuery, messageFrom, toolkitResult } from './results';
import { exampleVector, interpretCvss } from './cvss';
import type { CalculationResult } from '@subnetiq/shared';

const ports = portsData as PortEntry[];
const protocols = protocolsData as ProtocolEntry[];
const threats = threatsData as ThreatEntry[];
const commands = commandsData as CommandEntry[];
const cvssCards = cvssData as CvssCard[];

export function SourceLink({ href, label = 'Source' }: { href: string; label?: string }) {
  return (
    <a className="toolkit-source" href={href} target="_blank" rel="noreferrer">
      {label} <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

export function PortProtocolTool() {
  const [mode, setMode] = useState<'ports' | 'protocols'>('ports');
  const [query, setQuery] = useState('');
  const [transport, setTransport] = useState('all');
  const result = useMemo(() => {
    if (mode === 'protocols') {
      const filtered = protocols.filter((entry) =>
        matchesQuery(query, [entry.name, entry.layer, entry.description, entry.uses]),
      );
      return toolkitResult(
        'protocol-reference',
        'Protocol reference',
        { query },
        [
          { label: 'Matching protocols', value: filtered.length },
          { label: 'Reference type', value: 'Curated offline reference' },
        ],
        {
          rows: filtered.map((entry) => ({
            protocol: entry.name,
            layer: entry.layer,
            description: entry.description,
            uses: entry.uses,
          })),
          columns: [
            { key: 'protocol', label: 'Protocol' },
            { key: 'layer', label: 'Layer' },
            { key: 'description', label: 'Purpose' },
            { key: 'uses', label: 'Example use' },
          ],
          sources: [...new Set(filtered.map((entry) => entry.source))],
          steps: [
            {
              title: 'Search names and meanings',
              description:
                'Every search word must appear in the protocol name, layer, purpose, or example. A protocol can operate across several conceptual layers.',
            },
          ],
        },
      );
    }
    const filtered = ports.filter(
      (entry) =>
        (transport === 'all' || entry.transport.toLowerCase().includes(transport)) &&
        matchesQuery(query, [
          entry.port,
          entry.service,
          entry.transport,
          entry.description,
          entry.security,
        ]),
    );
    return toolkitResult(
      'port-reference',
      'Common ports and services',
      { query, transport },
      [
        { label: 'Matching entries', value: filtered.length },
        { label: 'Bundled entries', value: ports.length },
        { label: 'Registry coverage', value: 'Selected common services' },
      ],
      {
        rows: filtered.map((entry) => ({
          port: entry.port,
          transport: entry.transport,
          service: entry.service,
          description: entry.description,
          security: entry.security,
        })),
        columns: [
          { key: 'port', label: 'Port' },
          { key: 'transport', label: 'Transport' },
          { key: 'service', label: 'Service' },
          { key: 'description', label: 'Purpose' },
          { key: 'security', label: 'Security note' },
        ],
        sources: [...new Set(filtered.map((entry) => entry.source))],
        warnings: [
          'A registered or commonly used port does not prove which service is running or whether its traffic is encrypted. This tool searches reference data and does not scan hosts.',
        ],
        steps: [
          {
            title: 'Match the complete service tuple',
            description:
              'Transport is part of the lookup: TCP and UDP entries at the same port may have different roles.',
          },
          {
            title: 'Understand the port ranges',
            description:
              'IANA divides port numbers into System Ports (0–1023), User Ports (1024–49151), and Dynamic or Private Ports (49152–65535). Port 0 is reserved.',
          },
        ],
      },
    );
  }, [mode, query, transport]);
  return (
    <div className="stack">
      <Card>
        <div className="row toolkit-mode" aria-label="Reference type">
          <Button
            variant={mode === 'ports' ? 'primary' : 'secondary'}
            onClick={() => setMode('ports')}
            aria-pressed={mode === 'ports'}
          >
            Ports
          </Button>
          <Button
            variant={mode === 'protocols' ? 'primary' : 'secondary'}
            onClick={() => setMode('protocols')}
            aria-pressed={mode === 'protocols'}
          >
            Protocols
          </Button>
        </div>
        <div className="toolkit-filter-grid">
          <Field label="Search reference" hint="Search a number, name, purpose, or security note.">
            <div className="toolkit-search">
              <Search size={18} aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === 'ports' ? '443, DNS, encrypted…' : 'TCP, routing, transport…'}
                aria-label="Search ports and protocols"
              />
            </div>
          </Field>
          {mode === 'ports' && (
            <Field label="Transport">
              <Select value={transport} onChange={(event) => setTransport(event.target.value)}>
                <option value="all">TCP and UDP</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>
      {result.rows?.length === 0 && (
        <p role="status" className="muted">
          No matches in the bundled reference. Try a broader term.
        </p>
      )}
      <ResultPanel result={result} />
    </div>
  );
}

const layers = [
  {
    number: 7,
    title: 'Application',
    group: 'Application',
    unit: 'Data',
    examples: 'HTTP, DNS, SMTP',
    purpose: 'Defines exchanges and services used by applications.',
    addressing: 'Names, paths, and application identifiers',
    symptom: 'An HTTP response fails even though the host is reachable.',
  },
  {
    number: 6,
    title: 'Presentation',
    group: 'Application',
    unit: 'Data',
    examples: 'Encoding, serialization, compression',
    purpose: 'Represents data in a form both applications can understand.',
    addressing: 'Formats and encodings',
    symptom: 'The receiver cannot decode the representation.',
  },
  {
    number: 5,
    title: 'Session',
    group: 'Application',
    unit: 'Data',
    examples: 'Dialog establishment and recovery',
    purpose: 'Coordinates dialogs and continuity between participants.',
    addressing: 'Session identifiers',
    symptom: 'A dialog or application session repeatedly resets.',
  },
  {
    number: 4,
    title: 'Transport',
    group: 'Transport',
    unit: 'TCP segment / UDP datagram',
    examples: 'TCP, UDP',
    purpose: 'Carries application data between transport endpoints.',
    addressing: 'Port numbers',
    symptom: 'The destination service port is refused or filtered.',
  },
  {
    number: 3,
    title: 'Network',
    group: 'Internet',
    unit: 'Packet',
    examples: 'IPv4, IPv6, ICMP',
    purpose: 'Addresses and forwards packets across interconnected networks.',
    addressing: 'IP addresses and prefixes',
    symptom: 'The routing table lacks a path to the destination.',
  },
  {
    number: 2,
    title: 'Data link',
    group: 'Link',
    unit: 'Frame',
    examples: 'Ethernet, Wi-Fi, VLAN tagging',
    purpose: 'Exchanges frames over the current link.',
    addressing: 'Link-layer addresses and VLAN identifiers',
    symptom: 'Two devices are unexpectedly in different VLANs.',
  },
  {
    number: 1,
    title: 'Physical',
    group: 'Link',
    unit: 'Bits / symbols',
    examples: 'Copper, fiber, radio',
    purpose: 'Transmits signals through the physical medium.',
    addressing: 'Ports, channels, and media',
    symptom: 'A disconnected cable or weak radio signal disrupts the link.',
  },
];

const encapsulation = [
  {
    title: 'Application data',
    text: 'An application produces the message. DNS and HTTP have different message formats.',
    parts: ['Application data'],
  },
  {
    title: 'Transport segment',
    text: 'TCP adds a header containing source and destination ports, sequencing, and control fields. UDP uses its own smaller datagram header.',
    parts: ['TCP header', 'Application data'],
  },
  {
    title: 'IP packet',
    text: 'An IP header supplies source and destination IP addresses and information for forwarding the payload.',
    parts: ['IP header', 'TCP header', 'Application data'],
  },
  {
    title: 'Link frame',
    text: 'The current link adds its header and trailer. A router removes and replaces link framing on the next hop.',
    parts: ['Frame header', 'IP header', 'TCP header', 'Application data', 'Trailer'],
  },
  {
    title: 'Physical transmission',
    text: 'The interface turns the frame into signals. The receiver reconstructs and removes the applicable headers to deliver the message.',
    parts: ['Physical signals carrying the frame'],
  },
];

export function OsiTool() {
  const [selected, setSelected] = useState(4);
  const [model, setModel] = useState<'osi' | 'tcpip'>('osi');
  const [step, setStep] = useState(0);
  const layer = layers.find((item) => item.number === selected) ?? layers[3];
  const frame = encapsulation[step];
  const result = toolkitResult(
    'osi-reference',
    'OSI and TCP/IP reference',
    { model, selectedLayer: selected },
    [
      { label: 'OSI layer', value: layer.number + ' · ' + layer.title },
      { label: 'TCP/IP group', value: layer.group },
      { label: 'Data unit', value: layer.unit },
    ],
    {
      rows: layers.map((item) => ({
        osi: item.number + ' · ' + item.title,
        tcpip: item.group,
        unit: item.unit,
        examples: item.examples,
      })),
      columns: [
        { key: 'osi', label: 'OSI layer' },
        { key: 'tcpip', label: 'TCP/IP model' },
        { key: 'unit', label: 'Data unit' },
        { key: 'examples', label: 'Examples' },
      ],
      steps: [
        { title: layer.title + ' responsibility', description: layer.purpose },
        { title: 'Troubleshooting example', description: layer.symptom },
        {
          title: 'Use the model as a guide',
          description:
            'This practical mapping is a teaching aid. Internet protocols do not always follow strict OSI boundaries, and a symptom can have causes at several layers.',
        },
      ],
      sources: [
        'https://www.rfc-editor.org/rfc/rfc1122.html',
        'https://www.rfc-editor.org/rfc/rfc9293.html',
        'https://www.rfc-editor.org/rfc/rfc8200.html',
      ],
    },
  );
  return (
    <div className="stack">
      <div className="grid-2">
        <Card>
          <div className="row toolkit-mode" aria-label="Layer model">
            <Button
              variant={model === 'osi' ? 'primary' : 'secondary'}
              onClick={() => setModel('osi')}
              aria-pressed={model === 'osi'}
            >
              OSI · 7 layers
            </Button>
            <Button
              variant={model === 'tcpip' ? 'primary' : 'secondary'}
              onClick={() => setModel('tcpip')}
              aria-pressed={model === 'tcpip'}
            >
              TCP/IP · 4 layers
            </Button>
          </div>
          <div className="toolkit-layer-stack" aria-label="Select a network layer">
            {model === 'osi'
              ? layers.map((item) => (
                  <button
                    key={item.number}
                    className={'toolkit-layer ' + (selected === item.number ? 'selected' : '')}
                    onClick={() => setSelected(item.number)}
                    aria-pressed={selected === item.number}
                  >
                    <span className="toolkit-layer-number">{item.number}</span>
                    <strong>{item.title}</strong>
                    <span>{item.group}</span>
                  </button>
                ))
              : ['Application', 'Transport', 'Internet', 'Link'].map((group) => (
                  <button
                    key={group}
                    className={'toolkit-layer ' + (layer.group === group ? 'selected' : '')}
                    onClick={() =>
                      setSelected(layers.find((item) => item.group === group)?.number ?? 4)
                    }
                    aria-pressed={layer.group === group}
                  >
                    <strong>{group}</strong>
                    <span>
                      OSI{' '}
                      {layers
                        .filter((item) => item.group === group)
                        .map((item) => item.number)
                        .join(', ')}
                    </span>
                  </button>
                ))}
          </div>
        </Card>
        <Card>
          <Badge>Layer {layer.number}</Badge>
          <h2>{layer.title}</h2>
          <p>{layer.purpose}</p>
          <dl className="toolkit-definition-list">
            <dt>Examples</dt>
            <dd>{layer.examples}</dd>
            <dt>Addressing / identifiers</dt>
            <dd>{layer.addressing}</dd>
            <dt>Data unit</dt>
            <dd>{layer.unit}</dd>
            <dt>Investigate</dt>
            <dd>{layer.symptom}</dd>
          </dl>
        </Card>
      </div>
      <Card>
        <div className="row">
          <Badge>Encapsulation</Badge>
          <span className="muted">
            Step {step + 1} of {encapsulation.length}
          </span>
        </div>
        <h2>{frame.title}</h2>
        <p className="muted">{frame.text}</p>
        <div className="toolkit-packet" aria-label={frame.parts.join(', ')}>
          {frame.parts.map((part, index) => (
            <span key={part} className={'toolkit-packet-part toolkit-packet-' + index}>
              {part}
            </span>
          ))}
        </div>
        <div className="row toolkit-pagination">
          <Button
            variant="secondary"
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Previous
          </Button>
          <Button
            variant="secondary"
            disabled={step === encapsulation.length - 1}
            onClick={() => setStep((value) => value + 1)}
          >
            Next <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
        <p className="muted toolkit-caption">
          <ArrowDown size={14} aria-hidden="true" /> Sending adds framing. Receiving interprets and
          removes it.
        </p>
      </Card>
      <ResultPanel result={result} />
    </div>
  );
}

export function ThreatsTool() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = threats.filter((entry) =>
    matchesQuery(query, [entry.name, entry.description, ...entry.indicators, ...entry.defenses]),
  );
  const selected = threats.find((entry) => entry.id === selectedId);
  const result = selected
    ? toolkitResult(
        'threat-reference',
        selected.name + ' · defense brief',
        { threatId: selected.id },
        [
          { label: 'Threat', value: selected.name },
          { label: 'Description', value: selected.description },
        ],
        {
          rows: [
            ...selected.indicators.map((text) => ({ type: 'Possible indicator', detail: text })),
            ...selected.defenses.map((text) => ({ type: 'Defensive measure', detail: text })),
          ],
          columns: [
            { key: 'type', label: 'Category' },
            { key: 'detail', label: 'Detail' },
          ],
          steps: [
            {
              title: 'Correlate before concluding',
              description:
                'The listed symptoms are possible indicators. Establish context with device logs, configuration, and authorized observations before attributing an incident.',
            },
            {
              title: 'Apply layered defenses',
              description:
                'Choose controls appropriate to the link, network, application, and operational environment.',
            },
          ],
          sources: [selected.source],
        },
      )
    : null;
  return (
    <div className="stack">
      <Card>
        <Field label="Search threats and defenses">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ARP, DNS, VLAN, rate limiting…"
          />
        </Field>
        <p className="muted" role="status">
          {filtered.length} learning cards
        </p>
      </Card>
      <div className="grid-2">
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <h2>{entry.name}</h2>
            <p>{entry.description}</p>
            <h3>Possible indicators</h3>
            <ul className="toolkit-list">
              {entry.indicators.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <h3>Defenses</h3>
            <ul className="toolkit-list">
              {entry.defenses.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <div className="row">
              <Button variant="secondary" onClick={() => setSelectedId(entry.id)}>
                Open exportable brief
              </Button>
              <SourceLink href={entry.source} />
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="muted">No matching learning cards. Try a broader term.</p>
      )}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

export function CommandsTool() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = commands.filter(
    (entry) =>
      matchesQuery(query, [entry.name, entry.purpose, entry.syntax, entry.example]) &&
      (platform === 'all' || entry.platform.toLowerCase().includes(platform)),
  );
  const selected = commands.find((entry) => entry.id === selectedId);
  const result = selected
    ? toolkitResult(
        'command-reference',
        selected.name + ' command reference',
        { commandId: selected.id },
        [
          { label: 'Command', value: selected.name },
          { label: 'Platform', value: selected.platform },
          { label: 'Purpose', value: selected.purpose },
          { label: 'Syntax', value: selected.syntax },
          { label: 'Example', value: selected.example },
        ],
        {
          warnings: [selected.caution],
          sources: [selected.source],
          steps: [
            {
              title: 'Choose the right environment',
              description:
                'The command is displayed for review. Shell, privileges, interface names, and command options can differ across operating systems.',
            },
            {
              title: 'Use the documented scope',
              description:
                'Replace documentation addresses and interface names with resources you own or are authorized to administer. This application does not run the command.',
            },
          ],
        },
      )
    : null;
  return (
    <div className="stack">
      <Card>
        <div className="toolkit-filter-grid">
          <Field label="Find a command">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ping, DNS, routes, capture…"
            />
          </Field>
          <Field label="Platform">
            <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="all">All platforms</option>
              <option value="linux">Linux</option>
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
            </Select>
          </Field>
        </div>
      </Card>
      <div className="grid-2">
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <div className="row">
              <h2>{entry.name}</h2>
              <Badge>{entry.platform}</Badge>
            </div>
            <p>{entry.purpose}</p>
            <pre className="code-block toolkit-code">
              <code>{entry.example}</code>
            </pre>
            <p className="muted">{entry.caution}</p>
            <div className="row">
              <Button variant="secondary" onClick={() => setSelectedId(entry.id)}>
                Syntax, copy &amp; export
              </Button>
              <SourceLink href={entry.source} />
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="muted" role="status">
          No matching commands for this filter.
        </p>
      )}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

export function CvssTool() {
  const [query, setQuery] = useState('');
  const [vector, setVector] = useState(exampleVector);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  const filtered = cvssCards.filter((entry) =>
    matchesQuery(query, [entry.title, entry.description, entry.example]),
  );
  function readVector(event: FormEvent) {
    event.preventDefault();
    try {
      setResult(interpretCvss(vector));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(messageFrom(caught));
    }
  }
  return (
    <div className="stack">
      <Card>
        <Badge>CVSS 4.0</Badge>
        <h2>Read a vulnerability vector</h2>
        <p className="muted">
          Decode the Base, Threat, Environmental, and Supplemental metrics. Use the official FIRST
          calculator for a numerical score.
        </p>
        <form onSubmit={readVector} className="stack">
          <Field label="CVSS 4.0 vector">
            <Textarea
              value={vector}
              onChange={(event) => setVector(event.target.value)}
              rows={3}
              maxLength={1000}
              spellCheck={false}
            />
          </Field>
          <div className="row">
            <Button type="submit">Read vector</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setVector(exampleVector);
                setResult(null);
                setError('');
              }}
            >
              Load example
            </Button>
          </div>
        </form>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </Card>
      {result && (
        <>
          <ResultPanel result={result} />
          <a
            className="button button-secondary"
            href={String(result.data?.calculatorUrl)}
            target="_blank"
            rel="noreferrer"
          >
            Open this vector in FIRST calculator <ExternalLink size={15} aria-hidden="true" />
          </a>
        </>
      )}
      <Card>
        <Field label="Search CVSS and vulnerability cards">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Threat, environment, injection…"
          />
        </Field>
      </Card>
      <div className="grid-2">
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <h2>{entry.title}</h2>
            <p>{entry.description}</p>
            {entry.example && <p className="muted">{entry.example}</p>}
            <SourceLink href={entry.source} />
          </Card>
        ))}
      </div>
      <p className="muted toolkit-caption">
        CVSS is owned by FIRST.Org, Inc. and used by permission. The reference cards explain
        severity; they do not replace an assessment of exposure and business impact.
      </p>
    </div>
  );
}
