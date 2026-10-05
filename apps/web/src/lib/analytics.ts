import { toolIds } from '@subnetiq/shared';
import { usePreferences } from './preferences';

const events = new Set(['pageview', 'calculator_open', 'lesson_open', 'practice_start']);
const publicPages = new Set([
  '/',
  '/tools',
  '/toolkit',
  '/templates',
  '/learn',
  '/practice',
  '/glossary',
  '/cheatsheets',
  '/blog',
  '/privacy',
  '/terms',
  '/cookies',
  '/about',
  '/contact',
]);
const tools = new Set<string>(toolIds);
const sections = new Set([
  'ports',
  'osi',
  'mac',
  'dns',
  'ip-info',
  'firewall',
  'threats',
  'passwords',
  'hashes',
  'http-tls',
  'cvss',
  'commands',
  'bandwidth',
  'mtu',
]);

type AnalyticsPayload = { n: string; u: string; d: string; r?: string | null } & Record<
  string,
  unknown
>;
type AnalyticsOptions = {
  domain: string;
  autoCapturePageviews: false;
  outboundLinks: false;
  fileDownloads: false;
  formSubmissions: false;
  transformRequest: (payload: AnalyticsPayload) => AnalyticsPayload | null;
};
type Tracker = ((name: string, options?: { url: string }) => void) & {
  q?: unknown[][];
  o?: AnalyticsOptions;
  init?: (options: AnalyticsOptions) => void;
};
type AnalyticsWindow = Window & { plausible?: Tracker };

export function analyticsPath(path: string) {
  const clean = path.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  if (clean.length > 160 || !/^\/[a-z0-9/-]*$/.test(clean)) return undefined;
  if (publicPages.has(clean)) return clean;
  const parts = clean.split('/');
  if (parts.length !== 3) return undefined;
  if (parts[1] === 'tools' && tools.has(parts[2])) return clean;
  if (parts[1] === 'toolkit' && sections.has(parts[2])) return clean;
  if (['learn', 'blog'].includes(parts[1]) && /^[a-z0-9-]+$/.test(parts[2])) return `/${parts[1]}`;
  return undefined;
}

export function analyticsSettings() {
  const domain = import.meta.env.VITE_ANALYTICS_DOMAIN?.trim();
  if (
    import.meta.env.VITE_ANALYTICS_PROVIDER !== 'plausible' ||
    !domain ||
    !/^[a-z0-9.-]{1,253}$/i.test(domain)
  )
    return undefined;
  try {
    const source = new URL(import.meta.env.VITE_ANALYTICS_SCRIPT_URL || '');
    if (
      source.protocol !== 'https:' ||
      source.username ||
      source.password ||
      source.search ||
      source.hash ||
      !/\/pa-[a-z0-9_-]+\.js$/i.test(source.pathname)
    )
      return undefined;
    return { domain, source: source.toString() };
  } catch {
    return undefined;
  }
}

export function redactAnalyticsPayload(payload: AnalyticsPayload): AnalyticsPayload | null {
  if (
    usePreferences.getState().analyticsConsent !== 'accepted' ||
    !events.has(payload.n) ||
    !analyticsPath(window.location.pathname)
  )
    return null;
  try {
    const url = new URL(payload.u);
    const path = analyticsPath(url.pathname);
    if (url.origin !== window.location.origin || !path) return null;
    return { n: payload.n, u: `${url.origin}${path}`, d: payload.d, r: null };
  } catch {
    return null;
  }
}

export function loadAnalytics(settings: { domain: string; source: string }) {
  const win = window as AnalyticsWindow;
  let active = true;
  const queue: Tracker = (...args: unknown[]) => {
    if (active && usePreferences.getState().analyticsConsent === 'accepted') queue.q?.push(args);
  };
  queue.q = [];
  queue.init = (options) => {
    queue.o = options;
  };
  queue.init({
    domain: settings.domain,
    autoCapturePageviews: false,
    outboundLinks: false,
    fileDownloads: false,
    formSubmissions: false,
    transformRequest: (payload) => (active ? redactAnalyticsPayload(payload) : null),
  });
  win.plausible = queue;
  const script = document.createElement('script');
  script.src = settings.source;
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.id = 'optional-analytics';
  document.head.appendChild(script);
  return () => {
    active = false;
    queue.q = [];
    script.remove();
    if (win.plausible === queue) delete win.plausible;
  };
}

export function track(name: string, path = window.location.pathname) {
  if (
    usePreferences.getState().analyticsConsent !== 'accepted' ||
    !analyticsSettings() ||
    !events.has(name) ||
    !analyticsPath(window.location.pathname)
  )
    return;
  const clean = analyticsPath(path);
  if (!clean) return;
  (window as AnalyticsWindow).plausible?.(name, { url: `${window.location.origin}${clean}` });
}
