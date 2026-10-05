import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project } from '@subnetiq/shared';
import ProjectsPage from '@/pages/ProjectsPage';
import ProjectPage from '@/pages/ProjectPage';
import SharedProjectPage from '@/pages/SharedProjectPage';
import { normalizeNetwork } from './model';

const { apiMock, notifyMock, auth } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  notifyMock: vi.fn(),
  auth: { user: { id: 'owner-a' } as { id: string } | null, configured: true, loading: false },
}));
vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }));
vi.mock('@/lib/notify', () => ({ notify: notifyMock }));

const projectId = 'a0000000-0000-4000-8000-000000000001';
const token = 'A'.repeat(43);
const original: Project = {
  id: projectId,
  name: 'Main office',
  description: 'Employee network',
  address_space: 'office-vrf',
  version: 1,
  archived: false,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  plan: {
    schemaVersion: 1,
    networks: [normalizeNetwork({ id: 'staff', name: 'Staff', cidr: '10.20.0.0/24' })],
  },
};

function app(entry: string, page: 'list' | 'project' | 'shared') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/projects"
            element={page === 'list' ? <ProjectsPage /> : <p>Project list destination</p>}
          />
          <Route
            path="/projects/:id"
            element={page === 'project' ? <ProjectPage /> : <p>Private project opened</p>}
          />
          <Route path="/share/:token" element={<SharedProjectPage />} />
          <Route path="/auth" element={<p>Sign-in destination</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  apiMock.mockReset();
  notifyMock.mockReset();
  auth.user = { id: 'owner-a' };
  auth.configured = true;
  auth.loading = false;
  sessionStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('project workspace behavior', () => {
  it('keeps protected list requests disabled for an unconfigured guest', async () => {
    auth.user = null;
    auth.configured = false;
    app('/projects', 'list');
    expect(
      await screen.findByText('Your private workspace is ready to connect.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the network planner' })).toHaveAttribute(
      'href',
      '/tools/vlsm',
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('creates a reviewed project without supplying an owner or initial version', async () => {
    apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return { ...original, ...JSON.parse(String(options.body)) };
      if (path.startsWith('/projects?')) return [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    app('/projects', 'list');
    await screen.findByText('Make room for your first plan.');
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByLabelText('Project name'), 'Branch office');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Private project opened')).toBeInTheDocument();
    const submitted = apiMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(JSON.parse(String(submitted?.[1].body))).toMatchObject({
      name: 'Branch office',
      address_space: 'default',
      plan: { networks: [] },
    });
    expect(JSON.parse(String(submitted?.[1].body))).not.toHaveProperty('owner_id');
    expect(JSON.parse(String(submitted?.[1].body))).not.toHaveProperty('version');
  });

  it('sends the loaded version with an edit and displays the committed version', async () => {
    apiMock.mockImplementation(async (_path: string, options?: RequestInit) =>
      options?.method === 'PATCH'
        ? { ...original, ...JSON.parse(String(options.body)), version: 2 }
        : structuredClone(original),
    );
    const user = userEvent.setup();
    app(`/projects/${projectId}`, 'project');
    const name = await screen.findByLabelText('Project name');
    await user.clear(name);
    await user.type(name, 'Renamed office');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('PROJECT · VERSION 2')).toBeInTheDocument();
    const request = apiMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
    expect(JSON.parse(String(request?.[1].body))).toMatchObject({
      name: 'Renamed office',
      version: 1,
    });
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('preserves the local draft after a rejected stale version', async () => {
    apiMock.mockImplementation(async (_path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH')
        throw new Error('The project changed in another session. Reload it before saving.');
      return structuredClone(original);
    });
    const user = userEvent.setup();
    app(`/projects/${projectId}`, 'project');
    const name = await screen.findByLabelText('Project name');
    await user.clear(name);
    await user.type(name, 'Keep my draft');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('another session');
    expect(screen.getByLabelText('Project name')).toHaveValue('Keep my draft');
    expect(screen.getByText('PROJECT · VERSION 1')).toBeInTheDocument();
  });

  it('requires unapplied JSON to be validated before a project can be saved', async () => {
    apiMock.mockResolvedValue(structuredClone(original));
    const user = userEvent.setup();
    app(`/projects/${projectId}?view=json`, 'project');
    const input = await screen.findByRole('textbox', { name: 'Plan JSON' });
    fireEvent.change(input, { target: { value: '[1,2,3]' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Apply JSON to draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('must be a JSON object');
    expect(apiMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
  });

  it('creates a token once and revokes its corresponding stored share', async () => {
    let created = false;
    let revoked = false;
    const share = {
      id: 'share-a',
      created_at: '2026-10-04T12:00:00Z',
      expires_at: '2099-01-01T00:00:00Z',
      token,
    };
    apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === `/projects/${projectId}`) return structuredClone(original);
      if (options?.method === 'POST') {
        created = true;
        return share;
      }
      if (options?.method === 'DELETE') {
        revoked = true;
        return undefined;
      }
      if (path.endsWith('/shares'))
        return created ? [{ ...share, revoked_at: revoked ? '2026-10-04T12:01:00Z' : null }] : [];
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    app(`/projects/${projectId}?view=sharing`, 'project');
    await user.click(await screen.findByRole('button', { name: 'Create share link' }));
    expect(await screen.findByRole('link', { name: 'Open snapshot' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/share/${token}`),
    );
    const creation = apiMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(JSON.parse(String(creation?.[1].body))).toEqual({ expiresInDays: 30 });
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/shares/share-a', { method: 'DELETE' });
    expect(screen.queryByRole('link', { name: 'Open snapshot' })).not.toBeInTheDocument();
  });

  it('restores an owned revision using the current project version', async () => {
    const current = { ...original, version: 2, name: 'Changed office' };
    apiMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return { ...original, version: 3 };
      if (path.includes('/revisions'))
        return [
          {
            id: 'revision-a',
            project_id: projectId,
            name: 'Before expansion',
            snapshot: original,
            created_at: original.created_at,
          },
        ];
      return current;
    });
    const user = userEvent.setup();
    app(`/projects/${projectId}?view=revisions`, 'project');
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('PROJECT · VERSION 3')).toBeInTheDocument();
    const restoration = apiMock.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(JSON.parse(String(restoration?.[1].body))).toEqual({
      revisionId: 'revision-a',
      version: 2,
    });
  });

  it('shows an unavailable shared snapshot without requiring authentication', async () => {
    auth.user = null;
    apiMock.mockRejectedValue(new Error('This link is invalid, expired, or revoked.'));
    app(`/share/${token}`, 'shared');
    expect(await screen.findByText('This link is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('This link is invalid, expired, or revoked.')).toBeInTheDocument();
    expect(apiMock.mock.calls[0][0]).toBe(`/share/${token}`);
  });

  it('copies a shared snapshot into the signed-in user workspace', async () => {
    apiMock.mockImplementation(async (_path: string, options?: RequestInit) =>
      options?.method === 'POST'
        ? { ...original, name: 'Main office (copy)' }
        : structuredClone(original),
    );
    const user = userEvent.setup();
    app(`/share/${token}`, 'shared');
    await user.click(await screen.findByRole('button', { name: 'Save a private copy' }));
    await waitFor(() => expect(screen.getByText('Private project opened')).toBeInTheDocument());
    const submitted = apiMock.mock.calls.find((call) => call[1]?.method === 'POST');
    const body = JSON.parse(String(submitted?.[1].body));
    expect(body.name).toBe('Main office (copy)');
    expect(body.plan.networks[0].cidr).toBe('10.20.0.0/24');
    expect(body).not.toHaveProperty('owner_id');
    expect(body).not.toHaveProperty('id');
  });
});
