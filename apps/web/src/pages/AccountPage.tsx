import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  Download,
  ExternalLink,
  FileJson,
  LogOut,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import { downloadFile } from '@/lib/export';
import { usePreferences } from '@/lib/preferences';
import { Button, Card, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Profile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  preferences: Record<string, unknown>;
};
type Saved = {
  id: string;
  name: string;
  tool_id: string;
  input: Record<string, unknown>;
  created_at: string;
};
type Favorite = { id: string; tool_id: string; label: string };
type AccountOperation = {
  ownerId: string;
  signal: AbortSignal;
  assertCurrent: () => void;
};
const exportPageSize = 100;

function ownsStoragePath(path: string, ownerId: string) {
  const parts = path.split('/');
  return (
    parts[0] === ownerId &&
    parts.length > 1 &&
    parts.every((part) => part && part !== '.' && part !== '..' && !part.includes('\\'))
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  return <AccountContent key={user?.id ?? 'guest'} />;
}

function AccountContent() {
  const { user, configured, loading, signOut } = useAuth();
  const ownerId = user?.id;
  const [nameDraft, setDisplayName] = useState<string | null>(null);
  const [signedAvatar, setAvatar] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ name: string; created_at?: string | null }[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [fileOffset, setFileOffset] = useState(0);
  const [moreFiles, setMoreFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const pending = useRef(new Set<AbortController>());
  const preferences = usePreferences();
  const profile = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: ({ signal }) => api<Profile>('/profile', { signal }),
    enabled: Boolean(user),
  });
  const displayName = nameDraft ?? profile.data?.display_name ?? '';
  const avatar = signedAvatar?.path === profile.data?.avatar_path ? (signedAvatar?.url ?? '') : '';
  const saved = useQuery({
    queryKey: ['saved-calculations', user?.id],
    queryFn: ({ signal }) => api<Saved[]>('/saved-calculations', { signal }),
    enabled: Boolean(user),
  });
  const favorites = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: ({ signal }) => api<Favorite[]>('/favorites', { signal }),
    enabled: Boolean(user),
  });
  useEffect(() => {
    mounted.current = true;
    const operations = pending.current;
    return () => {
      mounted.current = false;
      for (const controller of operations) controller.abort();
      operations.clear();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const path = profile.data?.avatar_path;
    if (
      !ownerId ||
      !path ||
      !supabase ||
      profile.data?.id !== ownerId ||
      !ownsStoragePath(path, ownerId)
    )
      return;
    void supabase.storage
      .from('avatars')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (active) setAvatar(!error && data?.signedUrl ? { path, url: data.signedUrl } : null);
      })
      .catch(() => {
        if (active) setAvatar(null);
      });
    return () => {
      active = false;
    };
  }, [profile.data?.avatar_path, profile.data?.id, ownerId]);
  const action = async (
    work: (operation: AccountOperation) => Promise<unknown>,
    success?: string,
    propagate = false,
  ) => {
    if (!user || !mounted.current) return;
    const controller = new AbortController();
    pending.current.add(controller);
    const isCurrent = () => mounted.current && !controller.signal.aborted;
    const operation: AccountOperation = {
      ownerId: user.id,
      signal: controller.signal,
      assertCurrent: () => {
        if (!isCurrent())
          throw new DOMException('This account operation was cancelled.', 'AbortError');
      },
    };
    setBusy(true);
    try {
      await work(operation);
      operation.assertCurrent();
      if (success) notify(success);
    } catch (error) {
      if (!isCurrent()) return;
      if (propagate) throw error;
      notify(error instanceof Error ? error.message : 'The request failed.', 'error');
    } finally {
      pending.current.delete(controller);
      if (isCurrent()) setBusy(pending.current.size > 0);
    }
  };
  const uploadAvatar = async (file: File) => {
    if (!user || !supabase) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      notify('Choose a PNG, JPEG, WebP, or GIF image no larger than 5 MB.', 'error');
      return;
    }
    await action(async (operation) => {
      const extension = file.type.split('/')[1];
      const path = `${operation.ownerId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase!.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      operation.assertCurrent();
      try {
        await api('/profile', {
          method: 'PATCH',
          body: JSON.stringify({ avatar_path: path }),
          signal: operation.signal,
        });
      } catch (failure) {
        operation.assertCurrent();
        const cleanup = await supabase!.storage.from('avatars').remove([path]);
        operation.assertCurrent();
        if (cleanup.error)
          throw new Error(
            'Your profile was not updated, and the uploaded image could not be removed. Retry the upload or ask the deployment operator to clean up your private avatar folder.',
            { cause: failure },
          );
        throw failure;
      }
      operation.assertCurrent();
      const oldPath = profile.data?.avatar_path;
      if (oldPath && ownsStoragePath(oldPath, operation.ownerId)) {
        const cleanup = await supabase!.storage.from('avatars').remove([oldPath]);
        operation.assertCurrent();
        if (cleanup.error)
          notify(
            'Your new image is saved. The previous image could not be removed from private storage; account deletion will retry cleanup.',
            'warning',
          );
      }
      await profile.refetch();
    }, 'Profile image updated');
  };
  const loadFiles = async (operation: AccountOperation, append = false) => {
    if (!supabase) throw new Error('Private storage is not configured.');
    operation.assertCurrent();
    const offset = append ? fileOffset : 0;
    const { data, error } = await supabase.storage.from('exports').list(operation.ownerId, {
      limit: exportPageSize,
      offset,
      sortBy: { column: 'name', order: 'desc' },
    });
    operation.assertCurrent();
    if (error) throw error;
    const entries = data ?? [];
    const nextFiles = entries.filter(
      (file) =>
        file.id &&
        !file.name.includes('/') &&
        ownsStoragePath(`${operation.ownerId}/${file.name}`, operation.ownerId),
    );
    setFiles((previous) =>
      append
        ? [...new Map([...previous, ...nextFiles].map((file) => [file.name, file])).values()]
        : nextFiles,
    );
    setFileOffset(offset + entries.length);
    setMoreFiles(entries.length === exportPageSize);
    setStorageLoaded(true);
  };
  const exportAccount = async (storeCopy: boolean, operation: AccountOperation) => {
    const data = await api<{ account: { id: string }; data: Record<string, unknown> }>(
      '/account/export',
      { signal: operation.signal },
    );
    operation.assertCurrent();
    if (data.account?.id !== operation.ownerId)
      throw new Error('Your session changed. Reload this page before exporting account data.');
    const text = storeCopy ? JSON.stringify(data) : JSON.stringify(data, null, 2);
    if (storeCopy) {
      if (!supabase) throw new Error('Private storage is not configured.');
      const blob = new Blob([text], { type: 'application/json' });
      if (blob.size > 25 * 1024 * 1024)
        throw new Error(
          'This export exceeds the 25 MiB private storage limit. Download the account JSON instead.',
        );
      const name = `${operation.ownerId}/${Date.now()}-account-export.json`;
      const { error } = await supabase.storage.from('exports').upload(name, blob, {
        contentType: 'application/json',
      });
      operation.assertCurrent();
      if (error) throw error;
      await loadFiles(operation);
    } else downloadFile('subnetiq-account-export.json', text);
  };
  if (loading)
    return (
      <div className="loading-page">
        <span className="spinner" />
        Checking your session…
      </div>
    );
  if (!user)
    return (
      <div className="page">
        <PageHeader
          eyebrow="PERSONAL WORKSPACE"
          title="Keep your work connected."
          description="Save calculations, organize plans, and return to your learning progress."
        />
        <Card>
          <EmptyState
            title={configured ? 'Sign in to manage your account' : 'Account setup is needed'}
            description={
              configured
                ? 'Your private workspace is available after sign-in.'
                : 'This installation is running in guest mode. Configure Supabase to activate account features.'
            }
          >
            <Link className="button button-primary" to="/auth?returnTo=/account">
              {configured ? 'Sign in' : 'View setup details'}
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        eyebrow="PERSONAL WORKSPACE"
        title="Your account"
        description="Your profile, preferences, saved work, and private exports."
        actions={
          <Button variant="secondary" onClick={() => void action(() => signOut(), 'Signed out')}>
            <LogOut size={15} />
            Sign out
          </Button>
        }
      />
      {profile.error && (
        <div className="error-banner" role="alert">
          {profile.error.message}
        </div>
      )}
      <div className="grid-2">
        <Card className="stack">
          <div className="card-header">
            <h2>
              <User size={18} />
              Profile
            </h2>
            <ShieldCheck size={18} />
          </div>
          <div className="row">
            <div className="account-avatar">
              {avatar ? (
                <img src={avatar} alt="Your profile" />
              ) : (
                (displayName || user.email || 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <strong>{user.email}</strong>
              <div className="muted small">Private account</div>
            </div>
          </div>
          <Field label="Display name">
            <Input
              value={displayName}
              maxLength={100}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              disabled={busy || !displayName.trim()}
              onClick={() =>
                void action(async (operation) => {
                  await api('/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({ display_name: displayName.trim() }),
                    signal: operation.signal,
                  });
                  operation.assertCurrent();
                  await profile.refetch();
                }, 'Profile updated')
              }
            >
              Save profile
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} />
              Upload avatar
            </Button>
            <input
              className="sr-only"
              aria-label="Profile image file"
              type="file"
              ref={fileRef}
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
                event.target.value = '';
              }}
            />
          </div>
        </Card>
        <Card className="stack">
          <div className="card-header">
            <h2>
              <Settings size={18} />
              Workspace preferences
            </h2>
          </div>
          <Field label="Color theme">
            <Select
              value={preferences.theme}
              onChange={(event) =>
                preferences.setTheme(event.target.value as 'system' | 'light' | 'dark')
              }
            >
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
          <Field
            label="Language"
            hint="Navigation translations are available. Technical content currently uses English fallback."
          >
            <Select
              value={preferences.locale}
              onChange={(event) =>
                preferences.setLocale(event.target.value as typeof preferences.locale)
              }
            >
              <option value="en">English</option>
              <option value="am">አማርኛ</option>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </Select>
          </Field>
          <label className="switch-label">
            <input
              type="checkbox"
              checked={preferences.showSteps}
              onChange={(event) => preferences.setShowSteps(event.target.checked)}
            />
            Show calculation explanations
          </label>
          <Button
            variant="secondary"
            onClick={() =>
              void action(
                (operation) =>
                  api('/profile', {
                    method: 'PATCH',
                    signal: operation.signal,
                    body: JSON.stringify({
                      preferences: {
                        theme: preferences.theme,
                        locale: preferences.locale,
                        showSteps: preferences.showSteps,
                      },
                    }),
                  }),
                'Preferences saved to your profile',
              )
            }
            disabled={busy}
          >
            Save preferences to account
          </Button>
        </Card>
      </div>
      <Card className="section">
        <div className="card-header">
          <h2>
            <Bookmark size={18} />
            Saved calculations
          </h2>
          <span className="muted small">{saved.data?.length ?? 0} saved</span>
        </div>
        {saved.isLoading ? (
          <p className="muted">Loading saved calculations…</p>
        ) : saved.error ? (
          <p className="error-banner">{saved.error.message}</p>
        ) : !saved.data?.length ? (
          <EmptyState
            title="A good result is worth keeping"
            description="Use Save on any calculator to add a calculation here."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tool</th>
                  <th>Saved</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {saved.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.tool_id}</td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="row">
                        <Link
                          className="button button-ghost"
                          to={`/tools/${item.tool_id}?input=${encodeURIComponent(JSON.stringify(item.input))}`}
                        >
                          Open
                          <ExternalLink size={12} />
                        </Link>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Delete ${item.name}`}
                          onClick={() =>
                            void action(async (operation) => {
                              await api(`/saved-calculations/${item.id}`, {
                                method: 'DELETE',
                                signal: operation.signal,
                              });
                              operation.assertCurrent();
                              await saved.refetch();
                            }, 'Saved calculation removed')
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="section">
        <div className="card-header">
          <h2>Favorite tools</h2>
        </div>
        {favorites.error ? (
          <p className="error-banner">{favorites.error.message}</p>
        ) : !favorites.data?.length ? (
          <p className="muted">Use Favorite in a calculator header to keep it here.</p>
        ) : (
          <div className="row">
            {favorites.data.map((favorite) => (
              <div className="row" key={favorite.id}>
                <Link className="button button-secondary" to={`/tools/${favorite.tool_id}`}>
                  {favorite.label || favorite.tool_id}
                </Link>
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remove ${favorite.label || favorite.tool_id} from favorites`}
                  onClick={() =>
                    void action(async (operation) => {
                      await api(`/favorites/${favorite.id}`, {
                        method: 'DELETE',
                        signal: operation.signal,
                      });
                      operation.assertCurrent();
                      await favorites.refetch();
                    }, 'Favorite removed')
                  }
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="section stack">
        <div className="card-header">
          <h2>
            <FileJson size={18} />
            Your data, in your hands
          </h2>
        </div>
        <p className="muted">
          Download an account export, or keep an export in your private storage. Links to stored
          exports expire after five minutes.
        </p>
        <div className="row">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void action(
                (operation) => exportAccount(false, operation),
                'Account export downloaded',
              )
            }
          >
            <Download size={15} />
            Download account JSON
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void action((operation) => exportAccount(true, operation), 'Export saved privately')
            }
          >
            <Upload size={15} />
            Save a private export
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void action(loadFiles, 'Private exports loaded')}
          >
            Browse private exports
          </Button>
        </div>
        {storageLoaded &&
          (files.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Export</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.name}>
                      <td>{file.name}</td>
                      <td>
                        <div className="row">
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void action(async (operation) => {
                                const { data, error } = await supabase!.storage
                                  .from('exports')
                                  .download(`${operation.ownerId}/${file.name}`);
                                operation.assertCurrent();
                                if (error) throw error;
                                downloadFile(file.name, data, data.type);
                              }, 'Export downloaded')
                            }
                          >
                            <Download size={13} />
                            Download
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void action(async (operation) => {
                                const { data, error } = await supabase!.storage
                                  .from('exports')
                                  .createSignedUrl(`${operation.ownerId}/${file.name}`, 300);
                                operation.assertCurrent();
                                if (error) throw error;
                                await navigator.clipboard.writeText(data.signedUrl);
                              }, 'Five-minute download link copied')
                            }
                          >
                            <ExternalLink size={13} />
                            Copy temporary link
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Delete export ${file.name}`}
                            onClick={() =>
                              void action(async (operation) => {
                                const { error } = await supabase!.storage
                                  .from('exports')
                                  .remove([`${operation.ownerId}/${file.name}`]);
                                operation.assertCurrent();
                                if (error) throw error;
                                await loadFiles(operation);
                              }, 'Export removed')
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small">No private exports yet.</p>
          ))}
        {storageLoaded && moreFiles && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void action((operation) => loadFiles(operation, true), 'More private exports loaded')
            }
          >
            Load more exports
          </Button>
        )}
      </Card>
      <Card className="section">
        <h2>Delete your account</h2>
        <p className="muted" style={{ margin: '12px 0 18px' }}>
          This removes your saved work, history, profile, and stored files. Download an export first
          if you want to keep a copy.
        </p>
        <ConfirmDialog
          trigger={
            <Button variant="danger" disabled={busy}>
              <Trash2 size={14} />
              Delete account
            </Button>
          }
          title="Permanently delete this account?"
          description="Your account and stored workspace data will be deleted. This action cannot be undone."
          confirmLabel="Delete my account"
          requireText="DELETE"
          onConfirm={() =>
            action(
              async (operation) => {
                await api('/account', { method: 'DELETE', signal: operation.signal });
                operation.assertCurrent();
                notify('Account deleted');
                try {
                  await signOut();
                } catch {
                  operation.assertCurrent();
                  throw new Error(
                    'Your account was deleted, but this browser could not clear its session. Use Sign out or clear this site’s browser data.',
                  );
                }
              },
              undefined,
              true,
            )
          }
        />
      </Card>
    </div>
  );
}
