import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRight,
  FolderKanban,
  FolderPlus,
  Network,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import ResultPanel from '@/components/ResultPanel';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import { WorkspaceAccess } from '@/features/projects/ProjectViews';
import {
  errorMessage,
  isCalculation,
  parseNetworkCsv,
  parseProjectJson,
  planCalculations,
  planFromCalculation,
  planNetworks,
  record,
  validateDraft,
  type ProjectDraft,
} from '@/features/projects/model';

const handoffKey = 'subnetiq-pending-calculation';

function pendingCalculation(state: unknown): CalculationResult | null {
  if (record(state) && isCalculation(state.calculation)) return state.calculation;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(handoffKey) ?? 'null');
    return isCalculation(value) ? value : null;
  } catch {
    return null;
  }
}

export default function ProjectsPage() {
  const { user, configured, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [incoming, setIncoming] = useState(() => pendingCalculation(location.state));
  const [showCreate, setShowCreate] = useState(Boolean(incoming));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [target, setTarget] = useState('');
  const [includeAllocations, setIncludeAllocations] = useState(true);
  const [failure, setFailure] = useState('');
  const [draft, setDraft] = useState<ProjectDraft>(() => ({
    name: incoming?.title.slice(0, 100) ?? '',
    description: '',
    address_space: 'default',
    plan: incoming ? planFromCalculation(incoming) : { schemaVersion: 1, networks: [] },
    archived: false,
  }));
  const projects = useInfiniteQuery({
    queryKey: ['projects', user?.id],
    enabled: Boolean(user),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      api<Project[]>(`/projects?limit=24&offset=${pageParam}`, { signal }),
    getNextPageParam: (last, _pages, offset) => (last.length === 24 ? offset + 24 : undefined),
  });
  const loaded = useMemo(() => projects.data?.pages.flat() ?? [], [projects.data]);
  const visible = loaded.filter(
    (project) =>
      (filter === 'all' || Boolean(project.archived) === (filter === 'archived')) &&
      `${project.name} ${project.description} ${project.address_space}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const clearIncoming = () => {
    setIncoming(null);
    try {
      sessionStorage.removeItem(handoffKey);
    } catch {
      return;
    }
  };
  const create = useMutation({
    mutationFn: (value: ProjectDraft) =>
      api<Project>('/projects', { method: 'POST', body: JSON.stringify(validateDraft(value)) }),
    onSuccess: (project) => {
      clearIncoming();
      void queryClient.invalidateQueries({ queryKey: ['projects', user?.id] });
      notify('Project created');
      navigate(`/projects/${project.id}`);
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const attach = useMutation({
    mutationFn: async () => {
      if (!incoming) throw new Error('Choose a calculation to attach first.');
      const selected = loaded.find((project) => project.id === target);
      if (!selected) throw new Error('Choose an existing project.');
      const current = await api<Project>(`/projects/${selected.id}`);
      const networks = planNetworks(current.plan);
      const additions = includeAllocations
        ? planNetworks(planFromCalculation(incoming))
            .filter(
              (candidate) =>
                !networks.some(
                  (existing) =>
                    existing.cidr === candidate.cidr && existing.ipv6 === candidate.ipv6,
                ),
            )
            .map((network) => ({ ...network, id: crypto.randomUUID() }))
        : [];
      const checked = validateDraft({
        name: current.name,
        description: current.description,
        address_space: current.address_space,
        archived: Boolean(current.archived),
        plan: {
          ...current.plan,
          calculations: [...planCalculations(current.plan), incoming],
          networks: [...networks, ...additions],
        },
      });
      return api<Project>(`/projects/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: current.version, plan: checked.plan }),
      });
    },
    onSuccess: (project) => {
      clearIncoming();
      void queryClient.invalidateQueries({ queryKey: ['projects', user?.id] });
      queryClient.setQueryData(['project', user?.id, project.id], project);
      notify('Calculation attached to your project');
      navigate(`/projects/${project.id}`);
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setFailure('');
    try {
      if (file.size > 2_200_000) throw new Error('Choose a project file smaller than 2.2 MB.');
      const content = await file.text();
      const imported = file.name.toLowerCase().endsWith('.csv')
        ? validateDraft({
            name: file.name.replace(/\.csv$/i, '').slice(0, 100) || 'Imported networks',
            description: '',
            address_space: 'default',
            archived: false,
            plan: { schemaVersion: 1, networks: parseNetworkCsv(content) },
          })
        : parseProjectJson(content);
      setDraft(imported);
      setShowCreate(true);
      notify('Import validated. Review the details, then create your project.', 'info');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure('');
    create.mutate(draft);
  };
  const rememberIncoming = () => {
    if (!incoming) return;
    try {
      sessionStorage.setItem(handoffKey, JSON.stringify(incoming));
    } catch {
      notify(
        'The sign-in handoff could not be kept in this tab. Export the calculation if you need a backup.',
        'warning',
      );
    }
  };
  return (
    <div className="page stack">
      <PageHeader
        eyebrow="WORKSPACE"
        title="Your networks. In order."
        description="Bring calculations, allocations, and planning decisions into one place."
        actions={
          user ? (
            <Button
              onClick={() => {
                setFailure('');
                setShowCreate((value) => !value);
              }}
            >
              <Plus size={16} />
              {showCreate ? 'Close new project' : 'New project'}
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <Card>
          <p role="status">Loading your workspace…</p>
        </Card>
      ) : !user ? (
        <>
          <WorkspaceAccess
            configured={configured}
            returnTo="/projects"
            onSignIn={rememberIncoming}
          />
          {incoming && (
            <Card>
              <div className="card-header">
                <h2>Ready to add when you sign in</h2>
                <Badge>Unsaved calculation</Badge>
              </div>
              <ResultPanel result={incoming} />
            </Card>
          )}
          <div className="grid-3">
            <Card>
              <FolderKanban size={23} />
              <h3>Organize by context</h3>
              <p className="muted">Separate sites, routing domains, and address spaces.</p>
            </Card>
            <Card>
              <Archive size={23} />
              <h3>Keep each version</h3>
              <p className="muted">Review changes and restore a previous plan.</p>
            </Card>
            <Card>
              <Network size={23} />
              <h3>Plan both IP versions</h3>
              <p className="muted">Keep IPv4 and IPv6 allocations together.</p>
            </Card>
          </div>
        </>
      ) : (
        <>
          {failure && (
            <div className="error-banner" role="alert">
              {failure}
            </div>
          )}
          {incoming && (
            <Card className="stack">
              <div className="card-header">
                <div>
                  <h2>Add this calculation</h2>
                  <p className="muted small">{incoming.title}</p>
                </div>
                <Badge>{incoming.toolId}</Badge>
              </div>
              {loaded.length > 0 && (
                <>
                  <Field label="Existing project">
                    <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                      <option value="">Choose a project</option>
                      {loaded
                        .filter((project) => !project.archived)
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name} · {project.address_space}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={includeAllocations}
                      onChange={(event) => setIncludeAllocations(event.target.checked)}
                    />
                    Add its network allocations as well as the explanation
                  </label>
                  <div className="row">
                    <Button
                      disabled={!target || attach.isPending}
                      onClick={() => {
                        setFailure('');
                        attach.mutate();
                      }}
                    >
                      <FolderPlus size={15} />
                      {attach.isPending ? 'Adding…' : 'Add to selected project'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowCreate(true)}>
                      Create a new project instead
                    </Button>
                    <Button variant="ghost" onClick={clearIncoming}>
                      Dismiss calculation
                    </Button>
                  </div>
                </>
              )}
              {projects.hasNextPage && (
                <p className="small muted">
                  Load more projects below to select an older workspace.
                </p>
              )}
            </Card>
          )}
          {showCreate && (
            <Card>
              <div className="card-header">
                <h2>New project</h2>
                <Badge>{planNetworks(draft.plan).length} network rows</Badge>
              </div>
              <form className="stack" onSubmit={submit}>
                <div className="grid-2">
                  <Field label="Project name">
                    <Input
                      autoFocus
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder="Head office network"
                      maxLength={100}
                      required
                    />
                  </Field>
                  <Field
                    label="Address-space context"
                    hint="A site or routing domain where conflicts should be checked together."
                  >
                    <Input
                      value={draft.address_space}
                      onChange={(event) =>
                        setDraft({ ...draft, address_space: event.target.value })
                      }
                      placeholder="head-office"
                      maxLength={100}
                      required
                    />
                  </Field>
                </div>
                <Field label="Project notes">
                  <Textarea
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    rows={3}
                    maxLength={3000}
                    placeholder="Purpose, requirements, and decisions…"
                  />
                </Field>
                <Field
                  label={
                    <span className="row">
                      <Upload size={14} />
                      Start from a JSON or CSV file
                    </span>
                  }
                  hint="JSON supports exported projects or plan objects. CSV needs Name and CIDR columns; imported content is reviewed before saving."
                >
                  <Input
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      void importFile(file);
                    }}
                  />
                </Field>
                {planNetworks(draft.plan).length > 0 && (
                  <p className="small muted">
                    Included:{' '}
                    {planNetworks(draft.plan)
                      .slice(0, 5)
                      .map((network) => `${network.name} (${network.cidr})`)
                      .join(', ')}
                    {planNetworks(draft.plan).length > 5 ? '…' : ''}
                  </p>
                )}
                <div className="row">
                  <Button type="submit" disabled={create.isPending}>
                    <FolderPlus size={16} />
                    {create.isPending ? 'Creating…' : 'Create project'}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <div className="grid-2">
            <Field
              label={
                <span className="row">
                  <Search size={14} />
                  Filter loaded projects
                </span>
              }
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, notes, or address-space context"
              />
            </Field>
            <Field label="Project status">
              <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="active">Active projects</option>
                <option value="archived">Archived projects</option>
                <option value="all">All projects</option>
              </Select>
            </Field>
          </div>
          {projects.isPending ? (
            <Card>
              <p role="status">Loading projects…</p>
            </Card>
          ) : projects.isError ? (
            <Card>
              <div className="error-banner" role="alert">
                {errorMessage(projects.error)}
              </div>
              <Button variant="secondary" onClick={() => void projects.refetch()}>
                Try again
              </Button>
            </Card>
          ) : !visible.length ? (
            <Card>
              <EmptyState
                title={
                  loaded.length
                    ? 'No projects match this filter.'
                    : 'Make room for your first plan.'
                }
                description={
                  loaded.length
                    ? 'Try a different name or project status.'
                    : 'Create a blank project, add a calculation, or start from an editable network template.'
                }
              >
                <Button onClick={() => setShowCreate(true)}>
                  <Plus size={15} />
                  Create a project
                </Button>
                <Link className="button button-secondary" to="/templates">
                  Explore network templates
                </Link>
              </EmptyState>
            </Card>
          ) : (
            <div className="project-grid">
              {visible.map((project) => {
                let count: number;
                try {
                  count = planNetworks(project.plan).length;
                } catch {
                  count = 0;
                }
                return (
                  <Link
                    className="card project-card"
                    key={project.id}
                    to={`/projects/${project.id}`}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <FolderKanban size={24} style={{ color: 'var(--accent)' }} />
                      <Badge>{project.archived ? 'Archived' : `${count} networks`}</Badge>
                    </div>
                    <h3>{project.name}</h3>
                    <p>
                      {project.description ||
                        'A place for network allocations and planning decisions.'}
                    </p>
                    <div className="small muted">{project.address_space}</div>
                    <footer>
                      <span>
                        Version {project.version} ·{' '}
                        {new Date(project.updated_at).toLocaleDateString()}
                      </span>
                      <ArrowRight size={14} />
                    </footer>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">
              {loaded.length} projects loaded{projects.hasNextPage ? ' · more available' : ''}
            </span>
            {projects.hasNextPage && (
              <Button
                variant="secondary"
                disabled={projects.isFetchingNextPage}
                onClick={() => void projects.fetchNextPage()}
              >
                {projects.isFetchingNextPage ? 'Loading…' : 'Load more projects'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
