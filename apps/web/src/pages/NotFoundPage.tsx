import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
export default function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="404 · NO ROUTE TO THIS PAGE"
        title="Let’s get you back on the network."
        description="The page may have moved, or the address may contain a typo."
      />
      <Card className="empty-state">
        <MapPin size={38} />
        <h2>Choose a known destination</h2>
        <p className="muted">
          Open a calculator, explore the learning path, or use search to find a specific tool.
        </p>
        <div className="row">
          <Link className="button button-primary" to="/tools">
            All calculators
          </Link>
          <Link className="button button-secondary" to="/">
            Workspace overview
          </Link>
        </div>
      </Card>
    </div>
  );
}
