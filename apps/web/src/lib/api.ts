import { supabase } from './supabase';

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export function apiUrl(path: string) {
  const normalized =
    path.startsWith('/api/') || path === '/api'
      ? path
      : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return `${base}${normalized}`;
}
export async function apiHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return headers;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: await apiHeaders(options.headers),
    cache: 'no-store',
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      body?.error?.message || `Request failed (${response.status}). Please try again.`,
    );
  return body as T;
}
