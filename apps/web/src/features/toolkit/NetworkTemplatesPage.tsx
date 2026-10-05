import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Database, FolderPlus, Home, Network, School } from 'lucide-react';
import { parseNetwork } from '@subnetiq/netcalc';
import type { Project } from '@subnetiq/shared';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import templateData from '../../../../../data/network-templates.json';
import type { NetworkTemplate } from './types';
import { messageFrom } from './results';
import { calculateTemplate, templateInput } from './templates';
import './toolkit.css';

const templates = templateData as NetworkTemplate[];
const templateIcons = [Home, Building2, School, Database];

export default function NetworkTemplatesPage() {
  const [params, setParams] = useSearchParams();
  const template = templates.find((item) => item.id === params.get('template')) ?? templates[0];
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { user, configured } = useAuth();
  const navigate = useNavigate();
  const prepared = useMemo(() => {
    try {
      return { result: calculateTemplate(template), error: '' };
    } catch (caught) {
      return { result: null, error: messageFrom(caught) };
    }
  }, [template]);
  const input = templateInput(template);
  const total = Number(parseNetwork(template.network).size);
  const allocated = prepared.result?.blocks ?? [];
  const used = allocated.reduce((sum, block) => sum + Number(block.size), 0);
  const remaining = total - used;
  async function save() {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!prepared.result) return;
    setSaving(true);
    setSaveError('');
    try {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          address_space: 'default',
          plan: {
            kind: 'vlsm',
            input,
            result: prepared.result,
            templateId: template.id,
            networks: prepared.result.data?.networks ?? [],
          },
        }),
      });
      notify('Template saved as a project.');
      navigate('/projects/' + project.id);
    } catch (caught) {
      setSaveError(messageFrom(caught));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page toolkit-page">
      <PageHeader
        eyebrow="PLAN / DESIGN TEMPLATES"
        title="Start with a network that makes sense."
        description="Four complete example plans, with address allocations, VLANs, gateways, and room to adapt."
        actions={
          <Link className="button button-secondary" to="/toolkit">
            Back to toolkit
          </Link>
        }
      />
      <div className="toolkit-template-cards">
        {templates.map((item, index) => {
          const Icon = templateIcons[index] ?? Network;
          return (
            <button
              key={item.id}
              className={'toolkit-template-card ' + (template.id === item.id ? 'selected' : '')}
              onClick={() => {
                setParams({ template: item.id });
                setSaveError('');
              }}
              aria-pressed={template.id === item.id}
            >
              <Icon size={23} aria-hidden="true" />
              <strong>{item.name}</strong>
              <span className="muted">{item.network}</span>
              <span className="muted">{item.segments.length} named segments</span>
            </button>
          );
        })}
      </div>
      <Card>
        <div className="card-header">
          <div>
            <Badge>Editable starting point</Badge>
            <h2>{template.name}</h2>
            <p className="muted">{template.description}</p>
          </div>
        </div>
        <div className="row toolkit-template-actions">
          <Link
            className="button button-primary"
            to={'/tools/vlsm?input=' + encodeURIComponent(JSON.stringify(input))}
          >
            <Network size={17} aria-hidden="true" /> Open in VLSM planner
          </Link>
          <Button
            variant="secondary"
            disabled={saving || !prepared.result || !configured}
            onClick={() => void save()}
          >
            <FolderPlus size={17} aria-hidden="true" />
            {saving ? 'Saving…' : user ? 'Save as a project' : 'Sign in to save a project'}
          </Button>
        </div>
        {!configured && (
          <p className="muted toolkit-caption">
            Project saving becomes available after Supabase is configured. You can calculate and
            export this plan now.
          </p>
        )}
        {saveError && (
          <p className="error-banner" role="alert">
            {saveError}
          </p>
        )}
        {prepared.error && (
          <p className="error-banner" role="alert">
            {prepared.error}
          </p>
        )}
      </Card>
      {prepared.result && (
        <>
          <Card>
            <div className="card-header">
              <h2>Address-space allocation</h2>
              <Badge>{Math.round((used / total) * 100)}% allocated</Badge>
            </div>
            <div
              className="toolkit-space-map"
              aria-label={used + ' of ' + total + ' IPv4 addresses allocated'}
            >
              {allocated.map((block, index) => (
                <div
                  key={block.cidr}
                  className={'toolkit-space-block toolkit-space-color-' + (index % 6)}
                  style={{ width: (Number(block.size) / total) * 100 + '%' }}
                  title={block.name + ': ' + block.cidr + ' (' + block.size + ' addresses)'}
                >
                  <span>{block.name}</span>
                </div>
              ))}
              {remaining > 0 && (
                <div
                  className="toolkit-space-block toolkit-space-free"
                  style={{ width: (remaining / total) * 100 + '%' }}
                  title={remaining + ' unallocated addresses'}
                >
                  <span>Available</span>
                </div>
              )}
            </div>
            <div className="toolkit-map-legend">
              {allocated.map((block, index) => (
                <span key={block.cidr}>
                  <i className={'toolkit-space-color-' + (index % 6)} aria-hidden="true" />
                  {block.name} · {block.cidr}
                </span>
              ))}
              <span>
                <i className="toolkit-space-free" aria-hidden="true" />
                {remaining.toLocaleString()} addresses available
              </span>
            </div>
            <p className="muted toolkit-caption">
              The bar compares allocated address counts; it does not show physical topology. The
              table below provides exact ranges and purposes.
            </p>
          </Card>
          <ResultPanel result={prepared.result} onSave={configured ? save : undefined} />
        </>
      )}
    </div>
  );
}
