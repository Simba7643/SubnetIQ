import { Link } from 'react-router-dom';
import { Binary, BookOpen, Code2, Heart, Network, ShieldCheck } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
export default function AboutPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="BUILT FOR UNDERSTANDING"
        title="A clearer way to work with networks."
        description="SubnetIQ brings exact calculations, practical planning, and guided learning into a single workspace."
      />
      <div className="grid-2">
        <Card className="stack">
          <span className="icon-box">
            <Network />
          </span>
          <h2>The answer is a starting point.</h2>
          <p className="muted">
            A network address tells you where a subnet begins. Understanding how it was derived
            helps you trust the result, spot a bad assumption, and apply the same reasoning to a new
            plan.
          </p>
          <p className="muted">
            Every calculator connects its output with explicit inputs, address policies, and
            explanation steps. IPv4 and IPv6 counts stay exact, including address spaces too large
            for ordinary JavaScript numbers.
          </p>
        </Card>
        <Card className="stack">
          <span className="icon-box">
            <BookOpen />
          </span>
          <h2>From fundamentals to fieldwork.</h2>
          <p className="muted">
            Follow twelve lessons, search more than three hundred glossary entries, and build
            fluency in the practice lab. Then apply those concepts to named segments, cloud
            profiles, and real planning constraints.
          </p>
          <p className="muted">
            The reference toolkit keeps ports, protocols, DNS, registration data, firewall drafts,
            and troubleshooting commands within reach.
          </p>
        </Card>
      </div>
      <div className="section grid-3">
        <Card className="stack">
          <Binary size={24} />
          <h3>Deterministic core</h3>
          <p className="muted small">
            The browser and API use the same calculation package. Exact and covering aggregation are
            separate modes, and every capacity policy is explicit.
          </p>
        </Card>
        <Card className="stack">
          <ShieldCheck size={24} />
          <h3>Deliberate privacy</h3>
          <p className="muted small">
            Guest calculations run locally. Saved work belongs to an authenticated account. Project
            shares use expiring snapshots with revocation.
          </p>
        </Card>
        <Card className="stack">
          <Code2 size={24} />
          <h3>Inspectable code</h3>
          <p className="muted small">
            This release includes source, tests, database migrations, deployment configuration, and
            operational documentation under the MIT license.
          </p>
        </Card>
      </div>
      <Card className="section">
        <div className="row">
          <Heart size={20} />
          <h2>Help shape the next iteration.</h2>
        </div>
        <p className="muted" style={{ margin: '14px 0 18px' }}>
          Tell the operator where an explanation helped, which workflow felt awkward, or which
          reference deserves an update.
        </p>
        <Link className="button button-primary" to="/contact">
          Send feedback
        </Link>
      </Card>
    </div>
  );
}
