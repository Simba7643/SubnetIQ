import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { downloadFile } from '@/lib/export';
import { notify } from '@/lib/notify';
import AccountPage from './AccountPage';

const storage = vi.hoisted(() => ({
  avatars: { createSignedUrl: vi.fn(), upload: vi.fn(), remove: vi.fn() },
  exports: {
    list: vi.fn(),
    createSignedUrl: vi.fn(),
    download: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/export', () => ({ downloadFile: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: (bucket: keyof typeof storage) => storage[bucket] } },
}));

const ownerId = '11111111-1111-4111-8111-111111111111';
const nextOwner = '22222222-2222-4222-8222-222222222222';
const profile = {
  id: ownerId,
  display_name: 'Private name',
  avatar_path: null as string | null,
  preferences: {},
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function authenticate(id = ownerId) {
  const signOut = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    user: { id, email: `${id}@example.com` } as never,
    session: null,
    configured: true,
    loading: false,
    signOut,
  });
  return signOut;
}

function page() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  authenticate();
  vi.mocked(api).mockImplementation(async (path) => (path === '/profile' ? profile : []) as never);
  storage.avatars.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example/avatar' },
    error: null,
  });
  storage.avatars.upload.mockResolvedValue({ data: { path: `${ownerId}/new.png` }, error: null });
  storage.avatars.remove.mockResolvedValue({ data: [], error: null });
  storage.exports.list.mockResolvedValue({ data: [], error: null });
  storage.exports.upload.mockResolvedValue({ data: {}, error: null });
  storage.exports.remove.mockResolvedValue({ data: [], error: null });
});

describe('account privacy boundaries', () => {
  it('aborts pending account exports and never downloads their response after unmount', async () => {
    const pending = deferred<{ account: { id: string }; data: object }>();
    vi.mocked(api).mockImplementation(
      (path) =>
        (path === '/account/export'
          ? pending.promise
          : Promise.resolve(path === '/profile' ? profile : [])) as never,
    );
    const user = userEvent.setup();
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Download account JSON' }));
    const request = vi.mocked(api).mock.calls.find(([path]) => path === '/account/export');
    const signal = request?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ account: { id: ownerId }, data: { private: 'saved plan' } });
    });
    expect(downloadFile).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('clears private file state on account switch and blocks a delayed stored download', async () => {
    storage.exports.list.mockResolvedValue({
      data: [{ id: 'private-file', name: 'private-export.json' }],
      error: null,
    });
    const pending = deferred<{ data: Blob; error: null }>();
    storage.exports.download.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Browse private exports' }));
    await user.click(await screen.findByRole('button', { name: 'Download' }));
    expect(storage.exports.download).toHaveBeenCalledWith(`${ownerId}/private-export.json`);
    authenticate(nextOwner);
    vi.mocked(api).mockImplementation(
      async (path) =>
        (path === '/profile'
          ? { ...profile, id: nextOwner, display_name: 'New account' }
          : []) as never,
    );
    view.rerender(page());
    expect(screen.queryByText('private-export.json')).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve({ data: new Blob(['private data']), error: null });
    });
    expect(downloadFile).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('New account')).toBeInTheDocument();
  });

  it('does not copy a private signed link when its account has already closed', async () => {
    storage.exports.list.mockResolvedValue({
      data: [{ id: 'private-file', name: 'private-export.json' }],
      error: null,
    });
    const pending = deferred<{ data: { signedUrl: string }; error: null }>();
    storage.exports.createSignedUrl.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
    const view = render(page());
    await user.click(screen.getByRole('button', { name: 'Browse private exports' }));
    await user.click(await screen.findByRole('button', { name: 'Copy temporary link' }));
    view.unmount();
    await act(async () => {
      pending.resolve({
        data: { signedUrl: 'https://storage.example/private-token' },
        error: null,
      });
    });
    expect(clipboard).not.toHaveBeenCalled();
  });

  it('rejects foreign avatar paths and clears an avatar when the profile removes it', async () => {
    vi.mocked(api).mockImplementation(
      async (path) =>
        (path === '/profile'
          ? { ...profile, avatar_path: `${nextOwner}/foreign.png` }
          : []) as never,
    );
    render(page());
    await screen.findByDisplayValue('Private name');
    expect(storage.avatars.createSignedUrl).not.toHaveBeenCalled();
    await act(async () => {
      queryClient.setQueryData(['profile', ownerId], {
        ...profile,
        avatar_path: `${ownerId}/own.png`,
      });
    });
    expect(await screen.findByRole('img', { name: 'Your profile' })).toHaveAttribute(
      'src',
      'https://storage.example/avatar',
    );
    await act(async () => {
      queryClient.setQueryData(['profile', ownerId], profile);
    });
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Your profile' })).not.toBeInTheDocument(),
    );
  });

  it('reports old-avatar cleanup failure while preserving the new saved profile', async () => {
    const oldPath = `${ownerId}/old.png`;
    let currentProfile = { ...profile, avatar_path: oldPath };
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path !== '/profile') return [] as never;
      if (options?.method === 'PATCH')
        currentProfile = { ...currentProfile, ...JSON.parse(options.body as string) };
      return currentProfile as never;
    });
    storage.avatars.remove.mockResolvedValue({
      data: null,
      error: new Error('Storage unavailable'),
    });
    const user = userEvent.setup();
    render(page());
    await screen.findByRole('img', { name: 'Your profile' });
    await user.upload(
      screen.getByLabelText('Profile image file'),
      new File(['image'], 'avatar.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('previous image could not be removed'),
        'warning',
      ),
    );
    expect(storage.avatars.remove).toHaveBeenCalledWith([oldPath]);
    expect(currentProfile.avatar_path).toMatch(new RegExp(`^${ownerId}/.+\\.png$`));
    expect(currentProfile.avatar_path).not.toBe(oldPath);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Profile image updated'));
  });

  it('paginates stored exports instead of silently stopping at one hundred', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      name: `export-${index}.json`,
    }));
    storage.exports.list
      .mockResolvedValueOnce({ data: entries, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'older', name: 'older-export.json' }], error: null });
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getByRole('button', { name: 'Browse private exports' }));
    await user.click(await screen.findByRole('button', { name: 'Load more exports' }));
    expect(storage.exports.list).toHaveBeenLastCalledWith(ownerId, {
      limit: 100,
      offset: 100,
      sortBy: { column: 'name', order: 'desc' },
    });
    expect(await screen.findByText('older-export.json')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more exports' })).not.toBeInTheDocument();
  });

  it('refuses an export belonging to a different account', async () => {
    vi.mocked(api).mockImplementation(
      async (path) =>
        (path === '/account/export'
          ? { account: { id: nextOwner }, data: {} }
          : path === '/profile'
            ? profile
            : []) as never,
    );
    const user = userEvent.setup();
    render(page());
    await user.click(screen.getByRole('button', { name: 'Download account JSON' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Your session changed'), 'error'),
    );
    expect(downloadFile).not.toHaveBeenCalled();
    expect(storage.exports.upload).not.toHaveBeenCalled();
  });

  it('never signs out a new account when an earlier account deletion finishes late', async () => {
    const pending = deferred<{ deleted: boolean }>();
    vi.mocked(api).mockImplementation(
      (path) =>
        (path === '/account'
          ? pending.promise
          : Promise.resolve(path === '/profile' ? profile : [])) as never,
    );
    const user = userEvent.setup();
    const view = render(page());
    const oldSignOut = vi.mocked(useAuth).mock.results.at(-1)!.value.signOut;
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.type(screen.getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    const newSignOut = authenticate(nextOwner);
    view.rerender(page());
    await act(async () => {
      pending.resolve({ deleted: true });
    });
    expect(oldSignOut).not.toHaveBeenCalled();
    expect(newSignOut).not.toHaveBeenCalled();
  });
});
