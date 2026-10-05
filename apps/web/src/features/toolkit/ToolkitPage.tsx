import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  Cable,
  Fingerprint,
  Globe,
  Hash,
  Layers,
  LockKeyhole,
  Network,
  Shield,
  Terminal,
  Timer,
  Wrench,
} from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { CvssTool, CommandsTool, OsiTool, PortProtocolTool, ThreatsTool } from './ReferenceTools';
import { LookupTool, MacTool } from './LookupTools';
import { FirewallTool, HashTool, PasswordTool } from './SecurityTools';
import HttpTlsTool from './HttpTlsTool';
import CapacityTools from './CapacityTools';
import './toolkit.css';

export const toolkitSections = [
  {
    id: 'ports',
    title: 'Ports & protocols',
    description: 'Search service names, port numbers, transports, and security notes.',
    icon: BookOpen,
    mode: 'Offline reference',
  },
  {
    id: 'osi',
    title: 'OSI & TCP/IP explorer',
    description: 'Connect layers, data units, addressing, and encapsulation.',
    icon: Layers,
    mode: 'Interactive',
  },
  {
    id: 'mac',
    title: 'MAC & OUI lookup',
    description: 'Format addresses and interpret a clearly labeled vendor subset.',
    icon: Fingerprint,
    mode: 'Local',
  },
  {
    id: 'dns',
    title: 'DNS lookup',
    description: 'Query seven record types with resolver and cache provenance.',
    icon: Globe,
    mode: 'Online',
  },
  {
    id: 'ip-info',
    title: 'IP registration',
    description: 'Read public allocation records for an IPv4 or IPv6 address.',
    icon: Network,
    mode: 'Online',
  },
  {
    id: 'firewall',
    title: 'Firewall rule helper',
    description: 'Build iptables, UFW, Cisco ACLs, and pfSense worksheets.',
    icon: Shield,
    mode: 'Local',
  },
  {
    id: 'passwords',
    title: 'Password strength',
    description: 'Understand predictable patterns with a local assessment.',
    icon: LockKeyhole,
    mode: 'Local & private',
  },
  {
    id: 'hashes',
    title: 'SHA-2 digest generator',
    description: 'Generate UTF-8 SHA-256, SHA-384, and SHA-512 digests.',
    icon: Hash,
    mode: 'Local & private',
  },
  {
    id: 'http-tls',
    title: 'HTTP & TLS',
    description: 'Interpret header blocks and follow a TLS 1.3 handshake.',
    icon: Cable,
    mode: 'Interactive',
  },
  {
    id: 'threats',
    title: 'Threats & defenses',
    description: 'Learn indicators and defenses for common network threats.',
    icon: Activity,
    mode: 'Learning cards',
  },
  {
    id: 'cvss',
    title: 'CVSS & vulnerabilities',
    description: 'Read CVSS 4.0 vectors and understand vulnerability severity.',
    icon: Boxes,
    mode: 'Learning cards',
  },
  {
    id: 'commands',
    title: 'Command library',
    description: 'Find platform-specific syntax and practical examples.',
    icon: Terminal,
    mode: 'Offline reference',
  },
  {
    id: 'bandwidth',
    title: 'Bandwidth & transfer time',
    description: 'Calculate transfer time with explicit unit and throughput assumptions.',
    icon: Timer,
    mode: 'Calculator',
  },
  {
    id: 'mtu',
    title: 'MTU & MSS',
    description: 'Budget headers, options, and tunnel overhead for a packet.',
    icon: Wrench,
    mode: 'Calculator',
  },
];

function Section({ id }: { id: string }) {
  switch (id) {
    case 'ports':
      return <PortProtocolTool />;
    case 'osi':
      return <OsiTool />;
    case 'mac':
      return <MacTool />;
    case 'dns':
      return <LookupTool key="dns" kind="dns" />;
    case 'ip-info':
      return <LookupTool key="ip-info" kind="ip-info" />;
    case 'firewall':
      return <FirewallTool />;
    case 'passwords':
      return <PasswordTool />;
    case 'hashes':
      return <HashTool />;
    case 'http-tls':
      return <HttpTlsTool />;
    case 'threats':
      return <ThreatsTool />;
    case 'cvss':
      return <CvssTool />;
    case 'commands':
      return <CommandsTool />;
    case 'bandwidth':
      return <CapacityTools key="bandwidth" kind="bandwidth" />;
    case 'mtu':
      return <CapacityTools key="mtu" kind="mtu" />;
    default:
      return null;
  }
}

export default function ToolkitPage() {
  const { section } = useParams<{ section?: string }>();
  const current = toolkitSections.find((item) => item.id === section);
  if (section && !current)
    return (
      <div className="page">
        <EmptyState
          title="Toolkit section not found"
          description="Choose a tool from the networking toolkit."
        >
          <Link className="button button-primary" to="/toolkit">
            Open toolkit
          </Link>
        </EmptyState>
      </div>
    );
  if (current)
    return (
      <div className="page toolkit-page">
        <PageHeader
          eyebrow={'NETWORK TOOLKIT / ' + current.mode.toUpperCase()}
          title={current.title}
          description={current.description}
          actions={
            <Link className="button button-secondary" to="/toolkit">
              All toolkit tools
            </Link>
          }
        />
        <nav className="toolkit-section-nav no-print" aria-label="Networking toolkit sections">
          {toolkitSections.map((item) => (
            <Link
              key={item.id}
              to={'/toolkit/' + item.id}
              className={item.id === current.id ? 'active' : ''}
              aria-current={item.id === current.id ? 'page' : undefined}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <Section key={current.id} id={current.id} />
      </div>
    );
  return (
    <div className="page toolkit-page">
      <PageHeader
        eyebrow="NETWORK TOOLKIT"
        title="Understand the network around your plan."
        description="Practical lookups, protocol references, security helpers, and packet math in one workspace."
      />
      <Card className="toolkit-featured">
        <div>
          <Badge>Four complete starting points</Badge>
          <h2>A useful plan starts with clear purpose.</h2>
          <p className="muted">
            Explore home, small-business, campus, and data-center templates. Keep the VLANs,
            gateways, and paired address spaces together as you adapt them.
          </p>
          <Link className="button button-primary" to="/templates">
            Explore network templates <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="toolkit-featured-mark" aria-hidden="true">
          <Network size={72} strokeWidth={1.2} />
        </div>
      </Card>
      <div className="toolkit-grid">
        {toolkitSections.map((item) => (
          <Link key={item.id} to={'/toolkit/' + item.id} className="tool-card toolkit-index-card">
            <div className="row">
              <span className="icon-box">
                <item.icon size={21} aria-hidden="true" />
              </span>
              <Badge>{item.mode}</Badge>
            </div>
            <h2>{item.title}</h2>
            <p className="muted">{item.description}</p>
            <span className="toolkit-open">
              Open tool <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
