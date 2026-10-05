import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  LockKeyhole,
  Network,
  Pencil,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { toolIds, type Project } from '@subnetiq/shared';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import ResultPanel from '@/components/ResultPanel';
import { downloadFile, exportResultPdf } from '@/lib/export';
import { notify } from '@/lib/notify';
import { AllocationVisualizer } from '@/features/calculators/Visualizers';
import '@/features/calculators/calculators.css';
import {
  errorMessage,
  filename,
  mapResult,
  networkCsv,
  normalizeNetwork,
  planCalculations,
  planNetworks,
  projectReport,
  validateNetworks,
  type PlanNetwork,
} from './model';

export function WorkspaceAccess({
  configured,
  returnTo,
  onSignIn,
}: {
  configured: boolean;
  returnTo: string;
  onSignIn?: () => void;
}) {
  return (
    <Card>
      <EmptyState
        title={
          configured ? 'Keep your plans together.' : 'Your private workspace is ready to connect.'
        }
        description={
          configured
            ? 'Sign in to save projects, keep revisions, and share a read-only network plan.'
            : 'Saving projects becomes available when accounts are configured for this installation. You can calculate, plan, and export your work now.'
        }
      >
        <ShieldCheck size={32} aria-hidden="true" />
        {configured && (
          <Link
            className="button button-primary"
            onClick={onSignIn}
            to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Sign in to your workspace
          </Link>
        )}
        <Link className="button button-secondary" to="/tools/vlsm">
          Open the network planner
        </Link>
      </EmptyState>
    </Card>
  );
}

export function ProjectExports({ project, draft = false }: { project: Project; draft?: boolean }) {
  const [busy, setBusy] = useState(false);
  const json = () =>
    JSON.stringify(
      { schemaVersion: 1, exportedAt: new Date().toISOString(), unsavedDraft: draft, project },
      null,
      2,
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
      notify('Project JSON copied');
    } catch {
      notify('Clipboard access was denied. Download JSON to keep a copy.', 'error');
    }
  };
  const csv = () => {
    try {
      downloadFile(
        `${filename(project.name)}.csv`,
        networkCsv(validateNetworks(planNetworks(project.plan))),
        'text/csv;charset=utf-8',
      );
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };
  const pdf = async () => {
    setBusy(true);
    try {
      const result = projectReport(project);
      if (draft) {
        result.title += ' — unsaved draft';
        result.steps[0] = {
          title: 'Draft export',
          description: `Unsaved changes based on project version ${project.version}. Save the project to create a new durable version.`,
        };
      }
      await exportResultPdf(result);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row no-print" role="group" aria-label="Export project">
      <Button variant="ghost" onClick={() => void copy()}>
        <Copy size={15} />
        Copy
      </Button>
      <Button
        variant="ghost"
        onClick={() => downloadFile(`${filename(project.name)}.json`, json())}
      >
        <FileJson size={15} />
        JSON
      </Button>
      <Button variant="ghost" onClick={csv}>
        <FileSpreadsheet size={15} />
        CSV
      </Button>
      <Button variant="ghost" onClick={() => void pdf()} disabled={busy}>
        <Download size={15} />
        {busy ? 'Exporting…' : 'PDF'}
      </Button>
      <Button variant="ghost" onClick={() => window.print()}>
        <Printer size={15} />
        Print this view
      </Button>
      {draft && <Badge>Includes unsaved changes</Badge>}
    </div>
  );
}

export function NetworkTable({
  networks,
  onEdit,
  onRemove,
}: {
  networks: PlanNetwork[];
  onEdit?: (network: PlanNetwork) => void;
  onRemove?: (network: PlanNetwork) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const filtered = networks.filter((network) =>
    [network.name, network.cidr, network.ipv6, network.purpose, String(network.vlan ?? '')].some(
      (value) => value.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const visible = filtered.slice(pageIndex * 50, (pageIndex + 1) * 50);
  if (!networks.length)
    return (
      <EmptyState
        title="Start with your first network."
        description="Add an allocation, import a plan, or send a calculator result to this project."
      />
    );
  return (
    <div className="stack">
      <Field
        label={
          <span className="row">
            <Search size={14} />
            Find an allocation
          </span>
        }
      >
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Name, CIDR, VLAN, or purpose"
        />
      </Field>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Project network allocations</caption>
          <thead>
            <tr>
              <th>Name and purpose</th>
              <th>Primary CIDR</th>
              <th>IPv6 pair</th>
              <th>VLAN / gateway</th>
              <th>Allocation settings</th>
              {onEdit && <th className="no-print">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((network) => (
              <tr key={network.id}>
                <td>
                  <strong>{network.name}</strong>
                  {network.purpose && <div className="muted small">{network.purpose}</div>}
                  {network.parentId && (
                    <div className="muted small">
                      Within{' '}
                      {networks.find((candidate) => candidate.id === network.parentId)?.name ??
                        network.parentId}
                    </div>
                  )}
                  {network.notes && (
                    <details>
                      <summary className="small">Notes</summary>
                      <p style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>{network.notes}</p>
                    </details>
                  )}
                </td>
                <td>
                  <code dir="ltr">{network.cidr}</code>
                </td>
                <td>
                  <code dir="ltr">{network.ipv6 || '—'}</code>
                </td>
                <td>
                  {network.vlan === null ? 'No VLAN' : `VLAN ${network.vlan}`}
                  <div>
                    <code dir="ltr">{network.gateway || 'No gateway set'}</code>
                  </div>
                </td>
                <td>
                  <div className="stack" style={{ gap: 5 }}>
                    {network.locked && (
                      <Badge>
                        <LockKeyhole size={11} />
                        Locked
                      </Badge>
                    )}
                    {network.reserved && <Badge>Reserved</Badge>}
                    <span className="small muted">{network.growthPercent}% growth allowance</span>
                    <span className="small muted">
                      {network.policy}
                      {network.cloudVariant !== 'standard' ? ` · ${network.cloudVariant}` : ''}
                    </span>
                  </div>
                </td>
                {onEdit && (
                  <td className="no-print">
                    <div className="row">
                      <Button
                        variant="ghost"
                        onClick={() => onEdit(network)}
                        aria-label={`Edit ${network.name}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      {onRemove && (
                        <Button
                          variant="ghost"
                          onClick={() => onRemove(network)}
                          disabled={network.locked}
                          aria-label={`Remove ${network.name}`}
                          title={
                            network.locked
                              ? 'Unlock this allocation before removing it.'
                              : `Remove ${network.name}`
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={onEdit ? 6 : 5}>No allocations match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">
          {filtered.length ? pageIndex * 50 + 1 : 0}–
          {Math.min((pageIndex + 1) * 50, filtered.length)} of {filtered.length} matching rows
        </span>
        <div className="row no-print">
          <Button variant="ghost" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>
            Previous
          </Button>
          <Button
            variant="ghost"
            disabled={(pageIndex + 1) * 50 >= filtered.length}
            onClick={() => setPage(pageIndex + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProjectMaps({ networks }: { networks: PlanNetwork[] }) {
  const maps = useMemo(() => {
    try {
      return [mapResult(networks, 4), mapResult(networks, 6)].filter((value) => value !== null);
    } catch {
      return [];
    }
  }, [networks]);
  if (!maps.length) return null;
  return (
    <section className="stack">
      <p className="small muted">
        Each map uses the smallest prefix covering the displayed address family. Parent allocations
        may intentionally contain their child rows.
      </p>
      {maps.map((map) => (
        <AllocationVisualizer key={map.input.network} result={map.result} input={map.input} />
      ))}
    </section>
  );
}

export function SavedCalculations({ plan }: { plan: Record<string, unknown> }) {
  const calculations = planCalculations(plan);
  if (!calculations.length)
    return (
      <EmptyState
        title="No attached calculations yet."
        description="Open a calculator and choose Add to a project to keep the result and its explanation here."
      >
        <Link className="button button-secondary" to="/tools">
          Browse calculators
        </Link>
      </EmptyState>
    );
  return (
    <div className="stack">
      <p className="muted small">
        These calculations preserve their original inputs and results. Editing project allocations
        does not recalculate an earlier attachment.
      </p>
      {calculations.map((calculation, index) => {
        const input = JSON.stringify(calculation.normalizedInput);
        return (
          <details key={`${calculation.toolId}-${index}`} open={calculations.length === 1}>
            <summary>
              {calculation.title} · {calculation.toolId}
            </summary>
            <div className="stack" style={{ marginTop: 18 }}>
              {input.length <= 4000 &&
                (toolIds as readonly string[]).includes(calculation.toolId) && (
                  <Link
                    className="button button-secondary no-print"
                    to={`/tools/${calculation.toolId}?input=${encodeURIComponent(input)}`}
                  >
                    Reopen these inputs in the calculator
                  </Link>
                )}
              <ResultPanel result={calculation} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function NetworkEditorDialog({
  editing,
  networks,
  onClose,
  onSave,
}: {
  editing: PlanNetwork | null | undefined;
  networks: PlanNetwork[];
  onClose: () => void;
  onSave: (network: PlanNetwork) => void;
}) {
  return (
    <Dialog.Root
      open={editing !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby="network-editor-description">
          <div className="dialog-header">
            <Dialog.Title>{editing ? 'Edit allocation' : 'Add a network'}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Close allocation editor">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="network-editor-description" className="muted small">
            Set addressing, purpose, and planning preferences for this allocation.
          </Dialog.Description>
          {editing !== undefined && (
            <NetworkForm
              key={editing?.id ?? 'new'}
              initial={editing}
              networks={networks}
              onSave={onSave}
              onClose={onClose}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NetworkForm({
  initial,
  networks,
  onSave,
  onClose,
}: {
  initial: PlanNetwork | null;
  networks: PlanNetwork[];
  onSave: (network: PlanNetwork) => void;
  onClose: () => void;
}) {
  const [network, setNetwork] = useState<PlanNetwork>(
    () =>
      initial ??
      normalizeNetwork({ id: crypto.randomUUID(), name: '', cidr: '', growthPercent: 0 }),
  );
  const [error, setError] = useState('');
  const change = <K extends keyof PlanNetwork>(key: K, value: PlanNetwork[K]) =>
    setNetwork((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const all = [...networks.filter((entry) => entry.id !== network.id), network];
      const checked = validateNetworks(all).find((entry) => entry.id === network.id);
      if (checked) onSave(checked);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };
  return (
    <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <Field label="Network name">
        <Input
          autoFocus
          value={network.name}
          onChange={(event) => change('name', event.target.value)}
          required
          maxLength={100}
          placeholder="Engineering"
        />
      </Field>
      <div className="grid-2">
        <Field
          label="Primary CIDR"
          hint={
            network.locked
              ? 'Unlock this allocation to change its address.'
              : 'IPv4 or IPv6; host bits are normalized on save.'
          }
        >
          <Input
            dir="ltr"
            value={network.cidr}
            onChange={(event) => change('cidr', event.target.value)}
            readOnly={network.locked}
            required
            maxLength={64}
            placeholder="10.20.0.0/24"
          />
        </Field>
        <Field label="Paired IPv6 prefix" hint="Optional when the primary allocation is IPv4.">
          <Input
            dir="ltr"
            value={network.ipv6}
            onChange={(event) => change('ipv6', event.target.value)}
            readOnly={network.locked}
            maxLength={64}
            placeholder="2001:db8:20:10::/64"
          />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="VLAN ID">
          <Input
            type="number"
            min={1}
            max={4094}
            value={network.vlan ?? ''}
            onChange={(event) =>
              change('vlan', event.target.value === '' ? null : Number(event.target.value))
            }
            placeholder="10"
          />
        </Field>
        <Field label="Gateway address">
          <Input
            dir="ltr"
            value={network.gateway}
            onChange={(event) => change('gateway', event.target.value)}
            maxLength={64}
            placeholder="10.20.0.1"
          />
        </Field>
      </div>
      <Field label="Parent allocation">
        <Select
          value={network.parentId}
          onChange={(event) => change('parentId', event.target.value)}
        >
          <option value="">Top-level network</option>
          {networks
            .filter((entry) => entry.id !== network.id)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · {entry.cidr}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Purpose">
        <Input
          value={network.purpose}
          onChange={(event) => change('purpose', event.target.value)}
          maxLength={500}
          placeholder="Employee workstations"
        />
      </Field>
      <div className="grid-2">
        <Field label="IPv4 capacity policy">
          <Select
            value={network.policy}
            onChange={(event) => {
              const policy = event.target.value as PlanNetwork['policy'];
              setNetwork((current) => ({ ...current, policy, cloudVariant: 'standard' }));
            }}
          >
            <option value="lan">Conventional LAN</option>
            <option value="point-to-point">Point-to-point link</option>
            <option value="aws">AWS</option>
            <option value="azure">Azure</option>
            <option value="gcp">Google Cloud</option>
          </Select>
        </Field>
        <Field label="Provider allocation variant">
          <Select
            value={network.cloudVariant}
            onChange={(event) =>
              change('cloudVariant', event.target.value as PlanNetwork['cloudVariant'])
            }
          >
            <option value="standard">Standard</option>
            {network.policy === 'aws' && <option value="byoip">Bring your own IP</option>}
            {network.policy === 'gcp' && <option value="secondary">Secondary range</option>}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          value={network.notes}
          onChange={(event) => change('notes', event.target.value)}
          maxLength={10000}
          rows={3}
          placeholder="DHCP scope, routing context, service requirements…"
        />
      </Field>
      <Field
        label="Growth allowance (%)"
        hint="A planning preference; applying it requires rerunning the VLSM planner."
      >
        <Input
          type="number"
          min={0}
          max={10000}
          step={0.01}
          value={network.growthPercent}
          onChange={(event) => change('growthPercent', Number(event.target.value))}
        />
      </Field>
      <div className="row">
        <label className="switch-label">
          <input
            type="checkbox"
            checked={network.locked}
            onChange={(event) => change('locked', event.target.checked)}
          />
          Keep this allocation locked
        </label>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={network.reserved}
            onChange={(event) => change('reserved', event.target.checked)}
          />
          Reserved space
        </label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          <Network size={15} />
          {initial ? 'Apply changes' : 'Add allocation'}
        </Button>
      </div>
    </form>
  );
}
