import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePreferences } from '@/lib/preferences';
import { analyticsPath, analyticsSettings, loadAnalytics, track } from '@/lib/analytics';
import { Button } from './ui';

export function AnalyticsConsent() {
  const consent = usePreferences((state) => state.analyticsConsent);
  const setConsent = usePreferences((state) => state.setAnalyticsConsent);
  const { pathname } = useLocation();
  const settings = analyticsSettings();
  const domain = settings?.domain;
  const source = settings?.source;
  const publicRoute = Boolean(analyticsPath(pathname));
  useEffect(() => {
    if (!domain || !source || consent !== 'accepted' || !publicRoute) return;
    return loadAnalytics({ domain, source });
  }, [consent, domain, source, publicRoute]);
  useEffect(() => {
    if (domain && source && consent === 'accepted' && publicRoute) track('pageview', pathname);
  }, [consent, domain, source, publicRoute, pathname]);
  if (!settings || consent !== 'unknown' || !publicRoute) return null;
  return (
    <div className="consent-banner no-print" role="region" aria-label="Optional analytics consent">
      <p>
        Allow optional usage analytics to help improve this workspace?{' '}
        <Link to="/cookies">See what is collected</Link>.
      </p>
      <div className="row">
        <Button variant="secondary" onClick={() => setConsent('declined')}>
          Decline
        </Button>
        <Button onClick={() => setConsent('accepted')}>Allow analytics</Button>
      </div>
    </div>
  );
}
