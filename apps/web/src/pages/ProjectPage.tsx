import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Archive,
  ArrowLeft,
  Copy,
  ExternalLink,
  FileClock,
  GitCompareArrows,
  Link2,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  ScanSearch,
  Share2,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { calculate, parseNetwork } from '@subnetiq/netcalc';
import type { CalculationResult, Project } from '@subnetiq/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import ResultPanel from '@/components/ResultPanel';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import {
  NetworkEditorDialog,
  NetworkTable,
  ProjectExports,
  ProjectMaps,
  SavedCalculations,
  WorkspaceAccess,
} from '@/features/projects/ProjectViews';
import {
  errorMessage,
  parseNetworkCsv,
  parseProjectJson,
  planCalculations,
  planNetworks,
  projectDraft,
  record,
  revisionChanges,
  validateDraft,
  validateNetworks,
  type PlanNetwork,
  type ProjectDraft,
  type ProjectShare,
  type Revision,
} from '@/features/projects/model';

export default function ProjectPage() {
  const { id = '' } = useParams();
  const { user, configured, loading } = useAuth();
  const query = useQuery({
    queryKey: ['project', user?.id, id],
    enabled: Boolean(user && id),
    queryFn: ({ signal }) => api<Project>(`/projects/${id}`, { signal }),
    retry: false,
  });
  if (loading)
    return (
      <div className="page">
        <Card>
          <p role="status">Loading your workspace…</p>
        </Card>
      </div>
    );
  if (!user)
    return (
      <div className="page stack">
        <PageHeader eyebrow="PROJECTS" title="Open your private plan." />
        <WorkspaceAccess configured={configured} returnTo={`/projects/${id}`} />
      </div>
    );
  if (query.isPending)
    return (
      <div className="page">
        <Card>
          <p role="status">Loading project…</p>
        </Card>
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="page stack">
        <PageHeader title="This project could not be opened." />
        <div className="error-banner" role="alert">
          {errorMessage(query.error)}
        </div>
        <div className="row">
          <Button onClick={() => void query.refetch()}>
            <RefreshCw size={15} />
            Try again
          </Button>
          <Link className="button button-secondary" to="/projects">
            Back to projects
          </Link>
        </div>
      </div>
    );
  return (
    <ProjectEditor
      key={`${query.data.id}:${query.data.version}`}
      project={query.data}
      userId={user.id}
    />
  );
}

function ProjectEditor({ project, userId }: { project: Project; userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activeTab = ['networks', 'calculations', 'revisions', 'sharing', 'json'].includes(
    params.get('view') ?? '',
  )
    ? params.get('view')!
    : 'networks';
  const [history, setHistory] = useState<{
    past: ProjectDraft[];
    present: ProjectDraft;
    future: ProjectDraft[];
  }>(() => ({ past: [], present: projectDraft(project), future: [] }));
  const draft = history.present;
  const [failure, setFailure] = useState('');
  const [editing, setEditing] = useState<PlanNetwork | null | undefined>(undefined);
  const [checks, setChecks] = useState<CalculationResult[]>([]);
  const [checkpointName, setCheckpointName] = useState('');
  const [revisionLimit, setRevisionLimit] = useState(25);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [newShare, setNewShare] = useState<ProjectShare | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [imported, setImported] = useState<{
    name: string;
    draft: ProjectDraft;
    csv: boolean;
  } | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [importMetadata, setImportMetadata] = useState(false);
  const [jsonEdit, setJsonEdit] = useState<{ base: string; text: string } | null>(null);
  const serializedPlan = JSON.stringify(draft.plan, null, 2);
  const jsonText = jsonEdit?.base === serializedPlan ? jsonEdit.text : serializedPlan;
  const jsonDirty = jsonText !== serializedPlan;
  const dirty = JSON.stringify(draft) !== JSON.stringify(projectDraft(project)) || jsonDirty;
  const inspection = useMemo(() => {
    try {
      return { networks: planNetworks(draft.plan), error: '' };
    } catch (error) {
      return { networks: [], error: errorMessage(error) };
    }
  }, [draft.plan]);
  const networks = inspection.networks;
  const revisions = useQuery({
    queryKey: ['project-revisions', userId, project.id, revisionLimit],
    queryFn: ({ signal }) =>
      api<Revision[]>(`/projects/${project.id}/revisions?limit=${revisionLimit}`, { signal }),
    enabled: activeTab === 'revisions',
    retry: false,
  });
  const shares = useQuery({
    queryKey: ['project-shares', userId, project.id],
    queryFn: ({ signal }) => api<ProjectShare[]>(`/projects/${project.id}/shares`, { signal }),
    enabled: activeTab === 'sharing',
    retry: false,
  });
  const changeDraft = (next: ProjectDraft) => {
    setHistory((current) => ({
      past: [...current.past.slice(-29), current.present],
      present: next,
      future: [],
    }));
    setChecks([]);
  };
  const changeNetworks = (next: PlanNetwork[]) =>
    changeDraft({ ...draft, plan: { ...draft.plan, networks: validateNetworks(next) } });
  const changed = (next: Project) => {
    queryClient.setQueryData(['project', userId, project.id], next);
    void queryClient.invalidateQueries({ queryKey: ['projects', userId] });
    void queryClient.invalidateQueries({ queryKey: ['project-revisions', userId, project.id] });
  };
  const save = useMutation({
    mutationFn: () =>
      api<Project>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...validateDraft(draft), version: project.version }),
      }),
    onSuccess: (next) => {
      notify('Project saved with version history');
      changed(next);
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const duplicate = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(
          validateDraft({ ...draft, name: `${draft.name} (copy)`.slice(0, 100), archived: false }),
        ),
      }),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ['projects', userId] });
      notify('Project copied');
      navigate(`/projects/${next.id}`);
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api<void>(`/projects/${project.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['project', userId, project.id] });
      void queryClient.invalidateQueries({ queryKey: ['projects', userId] });
      notify('Project deleted');
      navigate('/projects');
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const checkpoint = useMutation({
    mutationFn: () =>
      api<Revision>(`/projects/${project.id}/revisions`, {
        method: 'POST',
        body: JSON.stringify({
          name: checkpointName.trim() || `Checkpoint at version ${project.version}`,
        }),
      }),
    onSuccess: () => {
      setCheckpointName('');
      void queryClient.invalidateQueries({ queryKey: ['project-revisions', userId, project.id] });
      notify('Checkpoint created');
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) =>
      api<Project>(`/projects/${project.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ revisionId, version: project.version }),
      }),
    onSuccess: (next) => {
      notify('Revision restored as a new project version');
      changed(next);
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const share = useMutation({
    mutationFn: () => {
      if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90)
        throw new Error('Choose a link lifetime from 1 to 90 days.');
      return api<ProjectShare>(`/projects/${project.id}/shares`, {
        method: 'POST',
        body: JSON.stringify({ expiresInDays }),
      });
    },
    onSuccess: (created) => {
      setNewShare(created);
      void queryClient.invalidateQueries({ queryKey: ['project-shares', userId, project.id] });
      notify('Read-only share created');
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => api<void>(`/shares/${shareId}`, { method: 'DELETE' }),
    onSuccess: (_data, shareId) => {
      if (newShare?.id === shareId) setNewShare(null);
      void queryClient.invalidateQueries({ queryKey: ['project-shares', userId, project.id] });
      notify('Share link revoked');
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const busy = save.isPending || duplicate.isPending || remove.isPending || restore.isPending;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const undo = () => {
    setChecks([]);
    setHistory((current) =>
      current.past.length
        ? {
            past: current.past.slice(0, -1),
            present: current.past[current.past.length - 1],
            future: [current.present, ...current.future],
          }
        : current,
    );
  };
  const redo = () => {
    setChecks([]);
    setHistory((current) =>
      current.future.length
        ? {
            past: [...current.past, current.present],
            present: current.future[0],
            future: current.future.slice(1),
          }
        : current,
    );
  };
  const reload = async () => {
    if (
      dirty &&
      !window.confirm(
        'Reload the latest saved version? Unsaved changes in this editor will be discarded.',
      )
    )
      return;
    try {
      const latest = await api<Project>(`/projects/${project.id}`);
      changed(latest);
      setHistory({ past: [], present: projectDraft(latest), future: [] });
      setJsonEdit(null);
      setFailure('');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const applyJson = () => {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!record(parsed)) throw new Error('A project plan must be a JSON object.');
      const checked = validateDraft({ ...draft, plan: parsed });
      changeDraft(checked);
      setJsonEdit(null);
      setFailure('');
      notify('JSON changes applied to the draft', 'info');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const validatePlan = () => {
    setFailure('');
    try {
      const checked = validateNetworks(networks);
      const results: CalculationResult[] = [];
      for (const family of [4, 6]) {
        const values = checked
          .flatMap((network) => [network.cidr, ...(network.ipv6 ? [network.ipv6] : [])])
          .filter((cidr) => parseNetwork(cidr).family === family);
        if (values.length > 0) results.push(calculate('overlap', { networks: values }));
      }
      setChecks(results);
      notify(
        checked.length
          ? 'Address checks are ready below the allocation table.'
          : 'Add an allocation before checking the plan.',
        'info',
      );
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const loadImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_200_000) throw new Error('Choose a project file smaller than 2.2 MB.');
      const source = await file.text();
      const csv = file.name.toLowerCase().endsWith('.csv');
      const value = csv
        ? validateDraft({ ...draft, plan: { ...draft.plan, networks: parseNetworkCsv(source) } })
        : parseProjectJson(source);
      setImported({ name: file.name, draft: value, csv });
      setImportMode('replace');
      setImportMetadata(false);
      setFailure('');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const applyImport = () => {
    if (!imported) return;
    try {
      let nextPlan = imported.draft.plan;
      if (importMode === 'append') {
        const additions = planNetworks(imported.draft.plan);
        const idMap = new Map(additions.map((network) => [network.id, crypto.randomUUID()]));
        nextPlan = {
          ...draft.plan,
          networks: [
            ...networks,
            ...additions.map((network) => ({
              ...network,
              id: idMap.get(network.id)!,
              parentId: network.parentId ? (idMap.get(network.parentId) ?? network.parentId) : '',
            })),
          ],
          calculations: [...planCalculations(draft.plan), ...planCalculations(imported.draft.plan)],
        };
      }
      const next = validateDraft({
        ...draft,
        ...(importMetadata && !imported.csv
          ? {
              name: imported.draft.name,
              description: imported.draft.description,
              address_space: imported.draft.address_space,
            }
          : {}),
        plan: nextPlan,
      });
      changeDraft(next);
      setImported(null);
      notify('Import applied to your draft. Save when you are ready.', 'info');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const doRestore = (revision: Revision) => {
    if (
      !window.confirm(
        `Restore “${revision.name || 'this checkpoint'}” as a new version?${dirty ? ' Your unsaved draft will be discarded.' : ' The current saved version will remain in history.'}`,
      )
    )
      return;
    setFailure('');
    restore.mutate(revision.id);
  };
  const shareUrl =
    newShare?.token && /^[A-Za-z0-9_-]{43}$/.test(newShare.token)
      ? new URL(`/share/${newShare.token}`, window.location.origin).toString()
      : '';

  return (
    <div className="page stack">
      <Link
        className="row small no-print"
        style={{ alignSelf: 'flex-start' }}
        to="/projects"
        onClick={(event) => {
          if (dirty && !window.confirm('Leave this project without saving the current draft?'))
            event.preventDefault();
        }}
      >
        <ArrowLeft size={14} />
        All projects
      </Link>
      <PageHeader
        eyebrow={`PROJECT · VERSION ${project.version}`}
        title={draft.name || 'Untitled project'}
        description={draft.address_space}
        actions={
          <>
            <Badge>{dirty ? 'Unsaved changes' : 'All changes saved'}</Badge>
            <Button
              disabled={!dirty || busy || jsonDirty}
              title={jsonDirty ? 'Apply JSON changes before saving.' : undefined}
              onClick={() => {
                setFailure('');
                save.mutate();
              }}
            >
              <Save size={15} />
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      />
      {failure && (
        <div className="error-banner" role="alert">
          <p>{failure}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            <RefreshCw size={14} />
            Reload saved version
          </Button>
        </div>
      )}
      <Card className="stack">
        <div className="grid-2">
          <Field label="Project name">
            <Input
              value={draft.name}
              onChange={(event) => changeDraft({ ...draft, name: event.target.value })}
              maxLength={100}
              required
            />
          </Field>
          <Field
            label="Address-space context"
            hint="Use a separate context for independently routed or intentionally overlapping private space."
          >
            <Input
              value={draft.address_space}
              onChange={(event) => changeDraft({ ...draft, address_space: event.target.value })}
              maxLength={100}
              required
            />
          </Field>
        </div>
        <Field label="Project notes">
          <Textarea
            value={draft.description}
            onChange={(event) => changeDraft({ ...draft, description: event.target.value })}
            maxLength={3000}
            rows={3}
          />
        </Field>
        <div className="row no-print" style={{ justifyContent: 'space-between' }}>
          <label className="switch-label">
            <input
              type="checkbox"
              checked={draft.archived}
              onChange={(event) => changeDraft({ ...draft, archived: event.target.checked })}
            />
            <Archive size={14} />
            Archived project
          </label>
          <div className="row">
            <Button
              variant="ghost"
              disabled={!history.past.length || busy || jsonDirty}
              onClick={undo}
            >
              <Undo2 size={14} />
              Undo
            </Button>
            <Button
              variant="ghost"
              disabled={!history.future.length || busy || jsonDirty}
              onClick={redo}
            >
              <Redo2 size={14} />
              Redo
            </Button>
            <Button variant="ghost" disabled={busy || jsonDirty} onClick={() => duplicate.mutate()}>
              <Copy size={14} />
              Save a copy
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void reload()}>
              <RefreshCw size={14} />
              Reload
            </Button>
          </div>
        </div>
      </Card>
      <div className="grid-3">
        <Card>
          <span className="stat-label">Network allocations</span>
          <div className="stat-value">{networks.length}</div>
        </Card>
        <Card>
          <span className="stat-label">Paired IPv4 / IPv6 rows</span>
          <div className="stat-value">{networks.filter((network) => network.ipv6).length}</div>
        </Card>
        <Card>
          <span className="stat-label">Locked allocations</span>
          <div className="stat-value">{networks.filter((network) => network.locked).length}</div>
        </Card>
      </div>
      <ProjectExports project={{ ...project, ...draft }} draft={dirty} />
      <Tabs
        value={activeTab}
        onValueChange={(view) => {
          const next = new URLSearchParams(params);
          next.set('view', view);
          setParams(next, { replace: true });
        }}
      >
        <TabsList className="no-print" aria-label="Project sections">
          <TabsTrigger value="networks">Allocations</TabsTrigger>
          <TabsTrigger value="calculations">Calculations</TabsTrigger>
          <TabsTrigger value="revisions">Revisions</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
          <TabsTrigger value="json">Plan JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="networks" className="stack" style={{ marginTop: 20 }}>
          <Card className="stack">
            <div className="card-header">
              <h2>Network allocations</h2>
              <div className="row no-print">
                <Button
                  variant="secondary"
                  onClick={validatePlan}
                  disabled={Boolean(inspection.error)}
                >
                  <ScanSearch size={15} />
                  Check conflicts
                </Button>
                <Button
                  onClick={() => setEditing(null)}
                  disabled={networks.length >= 1000 || Boolean(inspection.error)}
                >
                  <Plus size={15} />
                  Add network
                </Button>
              </div>
            </div>
            {inspection.error && (
              <div className="error-banner" role="alert">
                {inspection.error} Open Plan JSON to correct the imported structure.
              </div>
            )}
            <NetworkTable
              networks={networks}
              onEdit={setEditing}
              onRemove={(network) => {
                const children = networks.some((entry) => entry.parentId === network.id);
                if (
                  !window.confirm(
                    `Remove ${network.name} from this draft?${children ? ' Its children will become top-level allocations.' : ''}`,
                  )
                )
                  return;
                try {
                  changeNetworks(
                    networks
                      .filter((entry) => entry.id !== network.id)
                      .map((entry) =>
                        entry.parentId === network.id ? { ...entry, parentId: '' } : entry,
                      ),
                  );
                } catch (error) {
                  setFailure(errorMessage(error));
                }
              }}
            />
            <Field
              className="no-print"
              label={
                <span className="row">
                  <Upload size={14} />
                  Import allocations or a project
                </span>
              }
              hint="JSON and CSV are validated and previewed before they change your draft."
            >
              <Input
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={(event) => void loadImport(event)}
              />
            </Field>
          </Card>
          {checks.length > 0 && (
            <section className="stack">
              <p className="muted small">
                Conflicts are checked within this project context. A parent and its child can
                intentionally overlap; review the named allocations before treating containment as
                an error.
              </p>
              {checks.map((result, index) => (
                <ResultPanel key={index} result={result} />
              ))}
            </section>
          )}
          <ProjectMaps networks={networks} />
        </TabsContent>
        <TabsContent value="calculations" style={{ marginTop: 20 }}>
          <Card>
            <SavedCalculations plan={draft.plan} />
          </Card>
        </TabsContent>
        <TabsContent value="revisions" className="stack" style={{ marginTop: 20 }}>
          <Card className="stack">
            <div className="card-header">
              <div>
                <h2>Keep a checkpoint</h2>
                <p className="small muted">
                  Each save already preserves the previous version. Give a milestone a name to find
                  it later.
                </p>
              </div>
              <FileClock size={23} />
            </div>
            <div className="row">
              <Field label="Checkpoint name" style={{ flex: 1 }}>
                <Input
                  value={checkpointName}
                  onChange={(event) => setCheckpointName(event.target.value)}
                  maxLength={100}
                  placeholder="Before branch expansion"
                />
              </Field>
              <Button
                style={{ alignSelf: 'flex-end' }}
                disabled={dirty || checkpoint.isPending || busy}
                onClick={() => checkpoint.mutate()}
              >
                {checkpoint.isPending ? 'Saving…' : 'Create checkpoint'}
              </Button>
            </div>
            {dirty && (
              <p className="small muted">Save your changes before creating a checkpoint.</p>
            )}
          </Card>
          <Card>
            <div className="card-header">
              <h2>Revision history</h2>
              <Button variant="ghost" onClick={() => void revisions.refetch()}>
                <RefreshCw size={14} />
                Refresh
              </Button>
            </div>
            {revisions.isPending ? (
              <p role="status">Loading revision history…</p>
            ) : revisions.isError ? (
              <div className="error-banner" role="alert">
                {errorMessage(revisions.error)}
              </div>
            ) : !revisions.data?.length ? (
              <EmptyState
                title="Your first version is ready."
                description="Save a change or create a checkpoint to begin the revision history."
              />
            ) : (
              <>
                {revisions.data.map((revision) => (
                  <div className="revision-item" key={revision.id}>
                    <div>
                      <strong>{revision.name || 'Project revision'}</strong>
                      <p className="small muted">
                        {new Date(revision.created_at).toLocaleString()} · snapshot version{' '}
                        {String(revision.snapshot.version ?? 'unknown')}
                      </p>
                    </div>
                    <div className="row">
                      <Button variant="ghost" onClick={() => setSelectedRevision(revision)}>
                        <GitCompareArrows size={14} />
                        Compare
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => doRestore(revision)}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
                {revisions.data.length === revisionLimit && revisionLimit < 200 && (
                  <Button
                    variant="ghost"
                    onClick={() => setRevisionLimit(Math.min(200, revisionLimit + 25))}
                  >
                    Show older revisions
                  </Button>
                )}
                {revisionLimit === 200 && (
                  <p className="small muted">
                    Showing the most recent 200 revisions. Complete history is included in account
                    export.
                  </p>
                )}
              </>
            )}
          </Card>
          {selectedRevision && (
            <RevisionComparison
              revision={selectedRevision}
              current={draft}
              onClose={() => setSelectedRevision(null)}
            />
          )}
        </TabsContent>
        <TabsContent value="sharing" className="stack" style={{ marginTop: 20 }}>
          <Card className="stack">
            <div className="card-header">
              <div>
                <h2>Share a read-only snapshot</h2>
                <p className="small muted">
                  Anyone with the link can read this saved version. Future private edits create a
                  separate version.
                </p>
              </div>
              <Share2 size={23} />
            </div>
            <Field
              label="Link lifetime (days)"
              hint="Choose 1–90 days. You can revoke the link earlier."
            >
              <Input
                type="number"
                min={1}
                max={90}
                step={1}
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
              />
            </Field>
            <div className="row">
              <Button disabled={dirty || share.isPending || busy} onClick={() => share.mutate()}>
                <Link2 size={15} />
                {share.isPending ? 'Creating link…' : 'Create share link'}
              </Button>
              {dirty && (
                <span className="small muted">Save changes before creating a snapshot.</span>
              )}
            </div>
            {shareUrl && (
              <div className="stack" role="status">
                <div className="share-token">{shareUrl}</div>
                <p className="small muted">
                  Copy this link now. The complete token is shown once; existing links can still be
                  revoked below.
                </p>
                <div className="row">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => notify('Share link copied'))
                        .catch(() =>
                          notify(
                            'Clipboard access was denied. Select and copy the displayed link.',
                            'error',
                          ),
                        );
                    }}
                  >
                    <Copy size={14} />
                    Copy link
                  </Button>
                  <a
                    className="button button-ghost"
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                    Open snapshot
                  </a>
                </div>
              </div>
            )}
          </Card>
          <Card>
            <div className="card-header">
              <h2>Created links</h2>
              <Button variant="ghost" onClick={() => void shares.refetch()}>
                <RefreshCw size={14} />
                Refresh
              </Button>
            </div>
            {shares.isPending ? (
              <p role="status">Loading share links…</p>
            ) : shares.isError ? (
              <div className="error-banner" role="alert">
                {errorMessage(shares.error)}
              </div>
            ) : !shares.data?.length ? (
              <EmptyState
                title="No share links yet."
                description="Your project stays private until you create a link."
              />
            ) : (
              shares.data.map((entry) => {
                const expired = Date.parse(entry.expires_at) <= currentTime;
                return (
                  <div className="revision-item" key={entry.id}>
                    <div>
                      <strong>Created {new Date(entry.created_at).toLocaleString()}</strong>
                      <p className="small muted">
                        Expires {new Date(entry.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="row">
                      <Badge>{entry.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'}</Badge>
                      <Button
                        variant="danger"
                        disabled={Boolean(entry.revoked_at) || expired || revoke.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Revoke this link? Anyone who has it will lose future access.',
                            )
                          )
                            revoke.mutate(entry.id);
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            {shares.data?.length === 200 && (
              <p className="small muted">Showing the most recent 200 links.</p>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="json" className="stack" style={{ marginTop: 20 }}>
          <Card className="stack">
            <h2>Complete plan data</h2>
            <p className="muted small">
              Edit the underlying plan, including custom fields and attached calculations. Apply and
              validate the JSON before saving the project.
            </p>
            <Field label="Plan JSON">
              <Textarea
                dir="ltr"
                spellCheck={false}
                rows={20}
                value={jsonText}
                onChange={(event) =>
                  setJsonEdit({ base: serializedPlan, text: event.target.value })
                }
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
              />
            </Field>
            <div className="row">
              <Button disabled={!jsonDirty} onClick={applyJson}>
                Apply JSON to draft
              </Button>
              <Button variant="secondary" disabled={!jsonDirty} onClick={() => setJsonEdit(null)}>
                Discard JSON edits
              </Button>
              {jsonDirty && <Badge>JSON edits are not applied yet</Badge>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      <Card className="no-print">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3>Delete this project</h3>
            <p className="small muted">Deletes its allocations, revisions, and share links.</p>
          </div>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Permanently delete “${project.name}”, its revisions, and all its share links?`,
                )
              )
                remove.mutate();
            }}
          >
            <Trash2 size={15} />
            Delete project
          </Button>
        </div>
      </Card>
      <NetworkEditorDialog
        editing={editing}
        networks={networks}
        onClose={() => setEditing(undefined)}
        onSave={(network) => {
          try {
            changeNetworks(
              networks.some((entry) => entry.id === network.id)
                ? networks.map((entry) => (entry.id === network.id ? network : entry))
                : [...networks, network],
            );
            setEditing(undefined);
            setFailure('');
          } catch (error) {
            setFailure(errorMessage(error));
          }
        }}
      />
      <Dialog.Root
        open={Boolean(imported)}
        onOpenChange={(open) => {
          if (!open) setImported(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <div className="dialog-header">
              <Dialog.Title>Review the import</Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" aria-label="Close import preview">
                  <X size={18} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted small">
              {imported?.name} · {imported ? planNetworks(imported.draft.plan).length : 0} valid
              network rows. This changes the draft when applied.
            </Dialog.Description>
            {imported && (
              <div className="stack" style={{ marginTop: 18 }}>
                {failure && (
                  <div className="error-banner" role="alert">
                    {failure}
                  </div>
                )}
                <Field label="How should this import be applied?">
                  <Select
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value as 'replace' | 'append')}
                  >
                    <option value="replace">
                      Replace the current {imported.csv ? 'allocation list' : 'plan'}
                    </option>
                    <option value="append">Append allocations and calculations</option>
                  </Select>
                </Field>
                {!imported.csv && (
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={importMetadata}
                      onChange={(event) => setImportMetadata(event.target.checked)}
                    />
                    Use the imported name, project notes, and address-space context
                  </label>
                )}
                <NetworkTable networks={planNetworks(imported.draft.plan)} />
                <div className="row">
                  <Button onClick={applyImport}>Apply import to draft</Button>
                  <Button variant="secondary" onClick={() => setImported(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function RevisionComparison({
  revision,
  current,
  onClose,
}: {
  revision: Revision;
  current: ProjectDraft;
  onClose: () => void;
}) {
  const comparison = useMemo(() => {
    try {
      if (!record(revision.snapshot.plan))
        throw new Error('This revision has no complete plan to compare.');
      return { changes: revisionChanges(revision.snapshot.plan, current.plan), error: '' };
    } catch (error) {
      return { changes: null, error: errorMessage(error) };
    }
  }, [revision, current]);
  return (
    <Card className="stack">
      <div className="card-header">
        <div>
          <h2>Compare with {revision.name || 'checkpoint'}</h2>
          <p className="small muted">Changes from the selected snapshot to your current draft.</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close revision comparison">
          <X size={16} />
        </Button>
      </div>
      {comparison.error ? (
        <div className="error-banner" role="alert">
          {comparison.error}
        </div>
      ) : (
        comparison.changes && (
          <>
            <div className="grid-3">
              <div className="stat">
                <div className="stat-value">{comparison.changes.added.length}</div>
                <span className="stat-label">Added allocations</span>
              </div>
              <div className="stat">
                <div className="stat-value">{comparison.changes.removed.length}</div>
                <span className="stat-label">Removed allocations</span>
              </div>
              <div className="stat">
                <div className="stat-value">{comparison.changes.changed.length}</div>
                <span className="stat-label">Changed allocations</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Project metadata comparison</caption>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Selected revision</th>
                    <th>Current draft</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Name</th>
                    <td>{String(revision.snapshot.name ?? '')}</td>
                    <td>{current.name}</td>
                  </tr>
                  <tr>
                    <th>Address-space context</th>
                    <td>{String(revision.snapshot.address_space ?? '')}</td>
                    <td>{current.address_space}</td>
                  </tr>
                  <tr>
                    <th>Project notes</th>
                    <td style={{ whiteSpace: 'pre-wrap' }}>
                      {String(revision.snapshot.description ?? '')}
                    </td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{current.description}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(['added', 'removed', 'changed'] as const).map(
              (kind) =>
                comparison.changes![kind].length > 0 && (
                  <details key={kind} open>
                    <summary style={{ textTransform: 'capitalize' }}>{kind} allocations</summary>
                    <NetworkTable networks={comparison.changes![kind]} />
                  </details>
                ),
            )}
            <details>
              <summary>Complete snapshot JSON</summary>
              <pre className="code-block" style={{ maxHeight: 420, overflow: 'auto' }}>
                {JSON.stringify(revision.snapshot, null, 2)}
              </pre>
            </details>
          </>
        )
      )}
    </Card>
  );
}
