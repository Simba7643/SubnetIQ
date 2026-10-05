import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, RefreshCw } from 'lucide-react';
import type { Project } from '@subnetiq/shared';
import {
  Badge,
  Button,
  Card,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';
import {
  NetworkTable,
  ProjectExports,
  ProjectMaps,
  SavedCalculations,
} from '@/features/projects/ProjectViews';
import { errorMessage, planNetworks, projectDraft, validateDraft } from '@/features/projects/model';

export default function SharedProjectPage() {
  const { token = '' } = useParams();
  const { user, configured } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const query = useQuery({
    queryKey: ['shared-project', token],
    enabled: validToken,
    queryFn: ({ signal }) => api<Project>(`/share/${token}`, { signal }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 60000,
  });
  const inspected = useMemo(() => {
    try {
      return { networks: query.data ? planNetworks(query.data.plan) : [], error: '' };
    } catch (error) {
      return { networks: [], error: errorMessage(error) };
    }
  }, [query.data]);
  const copy = useMutation({
    mutationFn: () => {
      if (!query.data) throw new Error('The shared snapshot is not available.');
      return api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(
          validateDraft({
            ...projectDraft(query.data),
            name: `${query.data.name} (copy)`.slice(0, 100),
            archived: false,
          }),
        ),
      });
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects', user?.id] });
      notify('A private copy is now in your projects');
      navigate(`/projects/${project.id}`);
    },
  });
  if (!validToken || query.isError)
    return (
      <div className="page stack">
        <PageHeader
          eyebrow="SHARED PROJECT"
          title="This link is unavailable."
          description={
            !validToken
              ? 'Check that you copied the complete project link.'
              : errorMessage(query.error)
          }
        />
        <Card>
          <p className="muted">
            A shared link can expire or be revoked by its owner. Ask for a new link if you still
            need access.
          </p>
          <div className="row">
            {validToken && (
              <Button onClick={() => void query.refetch()}>
                <RefreshCw size={15} />
                Try again
              </Button>
            )}
            <Link className="button button-secondary" to="/tools">
              Open the calculators
            </Link>
          </div>
        </Card>
      </div>
    );
  if (query.isPending || !query.data)
    return (
      <div className="page">
        <Card>
          <p role="status">Opening shared project…</p>
        </Card>
      </div>
    );
  const project = query.data;
  return (
    <div className="page stack">
      <PageHeader
        eyebrow="SHARED PROJECT"
        title={project.name}
        description={project.description || 'A read-only network planning snapshot.'}
        actions={
          <Badge>
            <Eye size={13} />
            Read-only · version {project.version}
          </Badge>
        }
      />
      <Card className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{project.address_space}</strong>
            <p className="small muted">
              Snapshot version last saved {new Date(project.updated_at).toLocaleString()}. This view
              does not change when the owner edits a newer version.
            </p>
          </div>
          <Button className="no-print" variant="ghost" onClick={() => void query.refetch()}>
            <RefreshCw size={14} />
            Refresh access
          </Button>
        </div>
        <div className="row no-print">
          {user ? (
            <Button disabled={copy.isPending} onClick={() => copy.mutate()}>
              <Copy size={15} />
              {copy.isPending ? 'Copying…' : 'Save a private copy'}
            </Button>
          ) : configured ? (
            <Link
              className="button button-secondary"
              to={`/auth?returnTo=${encodeURIComponent(`/share/${token}`)}`}
            >
              Sign in to save a copy
            </Link>
          ) : (
            <Link className="button button-secondary" to="/tools">
              Explore the calculators
            </Link>
          )}
          <span className="small muted">Exports include only this shared snapshot.</span>
        </div>
        {copy.isError && (
          <div className="error-banner" role="alert">
            {errorMessage(copy.error)}
          </div>
        )}
      </Card>
      <ProjectExports project={project} />
      {inspected.error && (
        <div className="error-banner" role="alert">
          {inspected.error} The complete shared data can still be inspected below.
        </div>
      )}
      <Tabs defaultValue="networks">
        <TabsList className="no-print" aria-label="Shared project sections">
          <TabsTrigger value="networks">Network allocations</TabsTrigger>
          <TabsTrigger value="calculations">Saved calculations</TabsTrigger>
        </TabsList>
        <TabsContent value="networks" className="stack" style={{ marginTop: 20 }}>
          <Card>
            <NetworkTable networks={inspected.networks} />
          </Card>
          <ProjectMaps networks={inspected.networks} />
        </TabsContent>
        <TabsContent value="calculations" style={{ marginTop: 20 }}>
          <Card>
            <SavedCalculations plan={project.plan} />
          </Card>
        </TabsContent>
      </Tabs>
      <Card>
        <details>
          <summary>View the complete shared plan</summary>
          <pre
            className="code-block"
            dir="ltr"
            style={{ maxHeight: 420, overflow: 'auto', marginTop: 15 }}
          >
            {JSON.stringify(project.plan, null, 2)}
          </pre>
        </details>
      </Card>
    </div>
  );
}
