import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsConsent } from '@/components/AnalyticsConsent';
import {
  analyticsPath,
  analyticsSettings,
  loadAnalytics,
  redactAnalyticsPayload,
  track,
} from './analytics';
import { usePreferences } from './preferences';

const source = 'https://plausible.io/js/pa-example.js';
const trackerWindow = window as Window & {
  plausible?: ReturnType<typeof vi.fn> & {
    q?: unknown[][];
    o?: {
      autoCapturePageviews: boolean;
      outboundLinks: boolean;
      fileDownloads: boolean;
      formSubmissions: boolean;
      transformRequest: typeof redactAnalyticsPayload;
    };
  };
};

beforeEach(() => {
  vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'plausible');
  vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'example.test');
  vi.stubEnv('VITE_ANALYTICS_SCRIPT_URL', source);
  usePreferences.setState({ analyticsConsent: 'unknown' });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  delete trackerWindow.plausible;
  document.getElementById('optional-analytics')?.remove();
  usePreferences.setState({ analyticsConsent: 'unknown' });
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
});

describe('analytics privacy boundary', () => {
  it('uses known public paths and removes query, fragment, and article identifiers', () => {
    expect(analyticsPath('/tools/ipv4-subnet?input=private#secret')).toBe('/tools/ipv4-subnet');
    expect(analyticsPath('/toolkit/passwords')).toBe('/toolkit/passwords');
    expect(analyticsPath('/learn/ipv6-fundamentals')).toBe('/learn');
    expect(analyticsPath('/blog/network-planning')).toBe('/blog');
    for (const path of [
      '/share/token',
      '/projects/private',
      '/account',
      '/auth?returnTo=/share/token',
      '/login',
      '/assistant',
      '/api/profile',
      '/tools/unknown-user-value',
      '//evil.test',
      '/%73hare/token',
    ])
      expect(analyticsPath(path)).toBeUndefined();
  });

  it('rejects automatic legacy scripts, credentials, insecure origins, and query-bearing scripts', () => {
    expect(analyticsSettings()).toEqual({ domain: 'example.test', source });
    for (const url of [
      'https://plausible.io/js/script.js',
      'https://plausible.io/js/script.manual.js',
      'http://plausible.io/js/pa-example.js',
      'https://secret@plausible.io/js/pa-example.js',
      `${source}?token=secret`,
    ]) {
      vi.stubEnv('VITE_ANALYTICS_SCRIPT_URL', url);
      expect(analyticsSettings()).toBeUndefined();
    }
  });

  it('checks current consent and current route at every explicit event call', () => {
    const spy = vi.fn();
    trackerWindow.plausible = spy;
    track('pageview', '/tools');
    expect(spy).not.toHaveBeenCalled();
    usePreferences.setState({ analyticsConsent: 'accepted' });
    track('pageview', '/tools/ipv4-subnet?input=secret');
    expect(spy).toHaveBeenCalledExactlyOnceWith('pageview', {
      url: `${window.location.origin}/tools/ipv4-subnet`,
    });
    usePreferences.setState({ analyticsConsent: 'declined' });
    track('pageview', '/tools');
    usePreferences.setState({ analyticsConsent: 'accepted' });
    window.history.replaceState(null, '', '/share/secret');
    track('pageview', '/tools');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('removes referrers and arbitrary properties and rejects private or foreign payload URLs', () => {
    usePreferences.setState({ analyticsConsent: 'accepted' });
    const payload = {
      n: 'pageview',
      u: `${window.location.origin}/tools?utm_source=secret#secret`,
      d: 'example.test',
      r: '/share/secret',
      p: { password: 'secret' },
      extra: 'private',
    };
    expect(redactAnalyticsPayload(payload)).toEqual({
      n: 'pageview',
      u: `${window.location.origin}/tools`,
      d: 'example.test',
      r: null,
    });
    expect(
      redactAnalyticsPayload({ ...payload, u: `${window.location.origin}/share/secret` }),
    ).toBeNull();
    expect(redactAnalyticsPayload({ ...payload, u: 'https://other.test/tools' })).toBeNull();
    expect(redactAnalyticsPayload({ ...payload, n: 'form_submission' })).toBeNull();
    usePreferences.setState({ analyticsConsent: 'declined' });
    expect(redactAnalyticsPayload(payload)).toBeNull();
  });

  it('disables automatic capture before loading and invalidates late dispatch after cleanup', () => {
    usePreferences.setState({ analyticsConsent: 'accepted' });
    const stop = loadAnalytics({ domain: 'example.test', source });
    const queue = trackerWindow.plausible!;
    expect(queue.o).toMatchObject({
      autoCapturePageviews: false,
      outboundLinks: false,
      fileDownloads: false,
      formSubmissions: false,
    });
    const transform = queue.o!.transformRequest;
    const payload = { n: 'pageview', u: `${window.location.origin}/tools`, d: 'example.test' };
    expect(transform(payload)).not.toBeNull();
    const script = document.querySelector<HTMLScriptElement>('#optional-analytics')!;
    expect(script.referrerPolicy).toBe('no-referrer');
    stop();
    expect(transform(payload)).toBeNull();
    expect(queue.q).toEqual([]);
    expect(document.getElementById('optional-analytics')).toBeNull();
  });

  it('loads no third-party script before consent and removes it immediately on withdrawal', () => {
    render(
      <MemoryRouter initialEntries={['/tools']}>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    expect(document.getElementById('optional-analytics')).toBeNull();
    act(() => usePreferences.getState().setAnalyticsConsent('accepted'));
    expect(document.getElementById('optional-analytics')).not.toBeNull();
    act(() => usePreferences.getState().setAnalyticsConsent('declined'));
    expect(document.getElementById('optional-analytics')).toBeNull();
  });

  it('does not load a tracker when an accepted visitor opens a private share', () => {
    usePreferences.setState({ analyticsConsent: 'accepted' });
    render(
      <MemoryRouter initialEntries={['/share/private-token']}>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    expect(document.getElementById('optional-analytics')).toBeNull();
  });
});
