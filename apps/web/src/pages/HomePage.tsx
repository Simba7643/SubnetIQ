import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Binary,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  GraduationCap,
  Layers3,
  Network,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { calculate } from '@subnetiq/netcalc';
import { toolDefinitions } from '@/features/calculators/toolDefinitions';
import { Badge, Card } from '@/components/ui';

const featuredIds = ['ipv4-subnet', 'ipv6-subnet', 'vlsm', 'aggregate', 'range-to-cidr', 'convert'];
const faqs = [
  [
    'Can I use the calculators without an account?',
    'Yes. Every local calculator, the lessons, glossary, and guest practice work without an account. Sign in to keep projects, saved calculations, and learning history across devices.',
  ],
  [
    'Does SubnetIQ work offline?',
    'After the application is installed or visited online, its cached calculators and reference tools work offline. DNS, IP registry lookups, account storage, and live AI need a connection.',
  ],
  [
    'How are /31, /32, and IPv6 host counts handled?',
    'IPv4 capacity is explicit about conventional LAN, point-to-point, and cloud policies. IPv6 reports exact address capacity without an IPv4-style broadcast subtraction. Every result explains its assumptions.',
  ],
  [
    'Is the AI assistant always a live model?',
    'The assistant clearly labels demonstration mode. With a configured provider and a signed-in account, it can stream real responses. Network calculations remain grounded in the deterministic calculation engine.',
  ],
  [
    'Can I share a plan safely?',
    'Calculation URLs include the input you choose to share. Saved project shares are immutable, read-only snapshots with expiry and revocation. A recipient can retain a copy after access is revoked.',
  ],
];
export default function HomePage() {
  const [input, setInput] = useState('192.168.10.42/24');
  const [address, setAddress] = useState(input);
  const [error, setError] = useState('');
  const result = useMemo(() => {
    try {
      return calculate('ipv4-subnet', { address, policy: 'lan' });
    } catch {
      return null;
    }
  }, [address]);
  const read = (key: string) => String(result?.data?.[key] ?? '—');
  const binary = address
    .split('/')[0]
    .split('.')
    .map((octet) => Number(octet).toString(2).padStart(8, '0'))
    .join('');
  const prefix = Number(address.split('/')[1] ?? 32);
  const launch = () => {
    try {
      calculate('ipv4-subnet', { address: input, policy: 'lan' });
      setAddress(input);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Enter a valid IPv4 CIDR.');
    }
  };
  return (
    <div className="page home-page">
      <section className="hero">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="hero-eyebrow">
            <span className="status-dot" />
            YOUR NETWORK. FULLY UNDERSTOOD.
          </div>
          <h1>
            Network clarity,
            <br />
            <span>bit by bit.</span>
          </h1>
          <p>
            Calculate with confidence. Plan with precision. Understand the why behind every subnet,
            all in one thoughtfully connected workspace.
          </p>
          <div className="hero-buttons">
            <Link className="button button-primary" to="/tools/ipv4-subnet">
              Open subnet calculator
              <ArrowRight size={15} />
            </Link>
            <Link className="button button-secondary" to="/learn">
              <BookOpen size={15} />
              Start learning
            </Link>
          </div>
          <div className="hero-note">
            <span>
              <Check size={12} />
              Free core tools
            </span>
            <span>
              <Check size={12} />
              No account needed
            </span>
            <span>
              <Check size={12} />
              IPv4 + IPv6
            </span>
          </div>
        </motion.div>
        <motion.div
          className="live-calc"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <div className="live-calc-bar">
            <strong className="row">
              <Terminal size={13} />
              IPv4 subnet calculator
            </strong>
            <span className="row">
              <span className="status-dot" />
              LIVE PREVIEW
            </span>
          </div>
          <div className="live-calc-body">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                launch();
              }}
            >
              <label htmlFor="hero-address">IP address / prefix</label>
              <div className="live-input-row">
                <input
                  id="hero-address"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  spellCheck={false}
                  aria-describedby={error ? 'hero-error' : undefined}
                />
                <button aria-label="Calculate preview" type="submit">
                  <ArrowRight size={18} />
                </button>
              </div>
            </form>
            {error && (
              <p id="hero-error" className="error-banner">
                {error}
              </p>
            )}
            <dl className="live-result-grid">
              <div>
                <dt>NETWORK ADDRESS</dt>
                <dd>{read('networkAddress')}</dd>
              </div>
              <div>
                <dt>BROADCAST ADDRESS</dt>
                <dd>{read('broadcast')}</dd>
              </div>
              <div>
                <dt>SUBNET MASK</dt>
                <dd>{read('mask')}</dd>
              </div>
              <div className="accent">
                <dt>USABLE HOSTS</dt>
                <dd>{read('usableHosts')}</dd>
              </div>
            </dl>
            <div className="bit-strip" aria-label="Binary network and host bits">
              {binary.length === 32 &&
                [...binary].map((bit, index) => (
                  <span key={index} className={index >= prefix ? 'host-bit' : ''}>
                    {bit}
                  </span>
                ))}
            </div>
            <div className="bit-legend">
              <span>
                <i />
                NETWORK BITS · {prefix}
              </span>
              <span>
                <i className="host" />
                HOST BITS · {32 - prefix}
              </span>
            </div>
          </div>
          <div className="live-calc-bottom">
            <span className="row">
              <CheckCheck size={12} />
              Calculated locally. Explained clearly.
            </span>
            <Link
              to={`/tools/ipv4-subnet?input=${encodeURIComponent(JSON.stringify({ address, policy: 'lan' }))}`}
            >
              Full results
              <ArrowRight size={11} />
            </Link>
          </div>
        </motion.div>
      </section>
      <div className="overview-stats">
        <div className="overview-stat">
          <span className="icon-box">
            <Network />
          </span>
          <div>
            <strong>20</strong>
            <small>precision calculators</small>
          </div>
        </div>
        <div className="overview-stat">
          <span className="icon-box">
            <BookOpen />
          </span>
          <div>
            <strong>302</strong>
            <small>concepts explained</small>
          </div>
        </div>
        <div className="overview-stat">
          <span className="icon-box">
            <GraduationCap />
          </span>
          <div>
            <strong>12</strong>
            <small>guided learning modules</small>
          </div>
        </div>
        <div className="overview-stat">
          <span className="icon-box">
            <ShieldCheck />
          </span>
          <div>
            <strong>Local first</strong>
            <small>your calculations stay here</small>
          </div>
        </div>
      </div>
      <section>
        <div className="home-section-header">
          <div>
            <h2>Your everyday networking essentials</h2>
            <p>Start with the task at hand. Go as deep as you need.</p>
          </div>
          <Link to="/tools">
            All calculators
            <ArrowRight size={13} />
          </Link>
        </div>
        <div className="home-tool-grid">
          {featuredIds
            .map((id) => toolDefinitions.find((tool) => tool.id === id)!)
            .map((tool) => (
              <Link className="tool-card" to={`/tools/${tool.id}`} key={tool.id}>
                <div className="tool-card-top">
                  <span className="icon-box">
                    <tool.icon />
                  </span>
                  <Badge>{tool.category}</Badge>
                </div>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <span className="tool-card-footer">
                  Open calculator
                  <ArrowRight size={12} />
                </span>
              </Link>
            ))}
        </div>
      </section>
      <section className="learning-banner">
        <div>
          <span className="eyebrow">FROM ANSWERS TO UNDERSTANDING</span>
          <h2>Make the concepts click.</h2>
          <p>
            Move from binary fundamentals to real-world address plans. Short lessons, worked
            examples, and a practice lab help the knowledge stick.
          </p>
          <Link className="button button-secondary" to="/learn">
            Explore the learning path
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="lesson-preview">
          <Link to="/learn">
            <span className="lesson-number">01</span>
            <Binary size={16} />
            Binary &amp; address fundamentals
            <ChevronRight size={15} />
          </Link>
          <Link to="/learn">
            <span className="lesson-number">02</span>
            <Network size={16} />
            Subnetting that makes sense
            <ChevronRight size={15} />
          </Link>
          <Link to="/practice">
            <span className="lesson-number">LAB</span>
            <Zap size={16} />
            Put your knowledge to work
            <ChevronRight size={15} />
          </Link>
        </div>
      </section>
      <section className="section grid-3">
        <Card>
          <div className="icon-box">
            <Layers3 />
          </div>
          <h3 style={{ margin: '15px 0 9px' }}>Plan a real network</h3>
          <p className="muted small">
            Name segments, allow for growth, lock allocations, and preserve revisions in a project.
          </p>
          <Link className="tool-card-footer" to="/templates">
            Start from a template
            <ArrowRight size={12} />
          </Link>
        </Card>
        <Card>
          <div className="icon-box">
            <ShieldCheck />
          </div>
          <h3 style={{ margin: '15px 0 9px' }}>Keep useful tools close</h3>
          <p className="muted small">
            Inspect DNS, look up ports, draft firewall rules, and work through troubleshooting
            commands.
          </p>
          <Link className="tool-card-footer" to="/toolkit">
            Explore the toolkit
            <ArrowRight size={12} />
          </Link>
        </Card>
        <Card>
          <div className="icon-box">
            <Sparkles />
          </div>
          <h3 style={{ margin: '15px 0 9px' }}>Ask the next question</h3>
          <p className="muted small">
            Bring a calculation into the assistant and ask about the reasoning, assumptions, and
            next steps.
          </p>
          <Link className="tool-card-footer" to="/assistant">
            Meet your assistant
            <ArrowRight size={12} />
          </Link>
        </Card>
      </section>
      <section className="section grid-2">
        <Card>
          <Badge>Community preview</Badge>
          <h2 style={{ margin: '15px 0 10px' }}>Built to earn your trust.</h2>
          <p className="muted small">
            User stories will appear here once they are collected with permission. Until then,
            explore the worked examples and inspect every calculation step yourself.
          </p>
          <Link className="tool-card-footer" to="/contact">
            Share your feedback
            <ArrowRight size={12} />
          </Link>
        </Card>
        <Card>
          <Badge>Core workspace</Badge>
          <h2 style={{ margin: '15px 0 10px' }}>Start free.</h2>
          <p className="muted small">
            Calculators and learning materials are open to guests. Account features and live AI
            depend on the deployment configuration. This release has no billing or paid subscription
            flow.
          </p>
          <Link className="tool-card-footer" to="/auth">
            Create an account
            <ArrowRight size={12} />
          </Link>
        </Card>
      </section>
      <section className="section">
        <div className="home-section-header">
          <div>
            <h2>A few useful answers</h2>
            <p>Before you dive into the next subnet.</p>
          </div>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
