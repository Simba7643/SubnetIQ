import { Link, useParams } from 'react-router-dom';
import { Card, PageHeader, Button } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { usePreferences } from '@/lib/preferences';

const policies: Record<string, { title: string; description: string; content: string }> = {
  privacy: {
    title: 'Privacy policy',
    description: 'How this installation handles your information.',
    content: `## Who operates this workspace
This policy describes the SubnetIQ application supplied in this release. The operator of the installation you are using is responsible for its hosting, account configuration, support requests, and any additional privacy obligations. Use the contact form to ask the operator about this deployment.

## Calculations and local tools
Subnet calculations, conversions, local password estimates, and hash generation run in your browser. Their input is not automatically sent to an AI provider. Password text and hash input are excluded from saved calculation results, share URLs, analytics events, and structured exports. Do not put passwords or access keys in networking notes or AI messages.

## Account and saved information
If accounts are enabled, Supabase handles authentication. Your profile, projects, saved calculations, learning attempts, favorites, and conversation history are stored under your account. Private exports and profile images use private storage with access controls. Browser storage remembers your session and interface preferences.

## Requests that leave your browser
DNS and IP registration tools send the requested domain or IP address to this installation’s API and its configured public lookup services. Live AI sends the messages you submit and any calculation context you deliberately attach to the configured AI provider. The assistant identifies demonstration mode when a live model is not used.

## Shared projects
A project share is a read-only snapshot accessible to anyone with its high-entropy link until it expires or is revoked. Sharing exposes the snapshot’s content. Revocation stops future access through the application; it cannot remove copies already downloaded by a recipient.

## Operational data
The API uses bounded quotas and lookup caches. Request logs contain operational fields and request identifiers; authentication tokens, submitted passwords, chat text, and calculation inputs are not intentionally logged. Rate-limit identifiers are derived with a server-held secret. Hosting and upstream providers may maintain their own operational records.

## Analytics and consent
Optional analytics are disabled unless configured by the operator and accepted through the consent controls. This application only emits coarse page paths and named interface events. It excludes query strings, share tokens, private project identifiers, and form values. You can change your analytics choice on the cookies page.

## Access, deletion, and retention
Your account screen can export account data and request deletion of the account, associated workspace records, and private stored files. If a cleanup step fails, the application reports the incomplete deletion and allows a retry. Backups and upstream records are controlled by the deployment operator and service providers. Ask the operator for their retention schedule; this release does not promise a universal backup-erasure date.

## Contact
Use the contact page to ask about access, correction, deletion, retention, or this installation’s service providers.`,
  },
  terms: {
    title: 'Terms of use',
    description: 'Practical terms for the networking workspace.',
    content: `## Using SubnetIQ
SubnetIQ provides calculators, references, learning exercises, project organization, and optional AI assistance. Use the service lawfully and only with systems and information you are authorized to access. The operator of your installation is responsible for its availability and any deployment-specific terms.

## Verify before changing a network
The tools state their assumptions and distinguish address capacity from provider-specific reservations. A mathematically valid address plan can still conflict with routing, device configuration, provider rules, or an existing allocation. Review the result against your real environment before making changes. Generated firewall and command examples require review by a person responsible for the target system.

## Accounts and your content
Protect your sign-in credentials and keep recovery information current. You are responsible for content you submit, save, upload, or share. Do not upload secrets, unlawful material, or information you lack permission to disclose. Share links make the selected snapshot available to their holders.

## AI assistance
AI can produce incomplete or incorrect explanations. Demonstration mode is explicitly labeled. Attached calculations are recomputed by the deterministic engine, but this does not make every model statement authoritative. Provider availability, request limits, and account requirements may vary by installation.

## Acceptable use
Do not attempt to bypass access controls, exhaust service limits, harvest another user’s data, or exploit upstream services through these tools. The toolkit supports administration and education. Its presence does not grant permission to test or access someone else’s infrastructure.

## Availability and charges
This source release includes no payment processor or subscription billing. Hosting and AI costs belong to the deployment operator. Any future commercial offer requires separate, explicit terms. Features that need unconfigured services are shown as unavailable or demonstrational.

## Software and reference material
The supplied application code is provided under its included MIT license. Third-party packages and reference datasets retain their own licenses and notices. Network standards and provider documentation may change; refer to the sources linked by each tool.

## Ending use
You can stop using guest tools at any time and request account deletion from the account screen. The operator may restrict abusive use consistent with applicable obligations. Questions about these terms should go through the contact form.`,
  },
  cookies: {
    title: 'Cookies & local preferences',
    description: 'Simple controls for optional analytics.',
    content: `## Essential local storage
SubnetIQ remembers color theme, language, whether to show calculation steps, and your analytics choice in browser local storage. When you sign in, Supabase stores session information so the application can authenticate your requests. These functions support the workspace you requested.

## Offline application cache
The service worker caches public application assets and calculator resources for offline use. API responses, shared project snapshots, account pages, and private project data are excluded from its runtime cache. Removing browser site data clears the offline application and local preferences.

## Optional analytics
An analytics integration must be configured and consent must be accepted before its script is loaded. This application does not intentionally send form inputs, messages, passwords, query strings, share tokens, or private project identifiers as analytics events. The installed analytics provider may process technical request information under the operator’s configuration.

## Change your choice
Declining optional analytics leaves calculators and learning tools available. Changing an existing choice reloads the application to apply the choice to the analytics script. Essential session and preference storage remains in use while you use those features.`,
  },
};
export default function LegalPage({ kind }: { kind?: string }) {
  const params = useParams();
  const selected = kind || params.kind || 'privacy';
  const policy = policies[selected] || policies.privacy;
  const consent = usePreferences((state) => state.analyticsConsent);
  const setConsent = usePreferences((state) => state.setAnalyticsConsent);
  return (
    <div className="page legal-layout">
      <PageHeader eyebrow="TRANSPARENCY" title={policy.title} description={policy.description} />
      <Card>
        <p className="muted small">Release policy baseline · 4 October 2026</p>
        <Markdown>{policy.content}</Markdown>
        {selected === 'cookies' && (
          <div className="info-banner">
            <strong>Your choice: {consent}</strong>
            <div className="row" style={{ marginTop: 14 }}>
              <Button
                onClick={() => {
                  setConsent('accepted');
                  location.reload();
                }}
              >
                Allow optional analytics
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConsent('declined');
                  location.reload();
                }}
              >
                Decline optional analytics
              </Button>
            </div>
          </div>
        )}
        <div className="row" style={{ marginTop: 24 }}>
          <Link to="/contact">Contact the operator</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cookies">Cookie controls</Link>
        </div>
      </Card>
    </div>
  );
}
