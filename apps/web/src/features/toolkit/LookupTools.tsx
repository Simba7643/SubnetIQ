import { type FormEvent, useEffect, useRef, useState } from 'react';
import { calculate } from '@subnetiq/netcalc';
import type { CalculationResult } from '@subnetiq/shared';
import { LoaderCircle } from 'lucide-react';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import ouiData from '../../../../../data/oui-subset.json';
import type { OuiEntry } from './types';
import { messageFrom } from './results';
import { SourceLink } from './ReferenceTools';

const ouiEntries = ouiData as OuiEntry[];
const dnsTypes = {
  A: 'IPv4 addresses associated with a name.',
  AAAA: 'IPv6 addresses associated with a name.',
  MX: 'Mail exchangers and preferences. Lower preference numbers are preferred.',
  TXT: 'Text values used by applications, including mail authentication policies.',
  NS: 'Names of authoritative servers for a zone.',
  CNAME: 'An alias pointing to another domain name.',
  PTR: 'A reverse-DNS name. Enter an IP address or its reverse lookup name.',
};

export function MacTool() {
  const [address, setAddress] = useState('00:00:0C:12:34:56');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const calculation = calculate('mac', { address });
      const normalized = String(calculation.data?.normalized ?? '').toUpperCase();
      const prefix = String(calculation.data?.oui ?? normalized.slice(0, 8))
        .replace(/-/g, ':')
        .toUpperCase();
      const locallyAdministered = Boolean(calculation.data?.locallyAdministered);
      const multicast = Boolean(calculation.data?.multicast);
      const vendor = ouiEntries.find(
        (entry) => entry.prefix.replace(/-/g, ':').toUpperCase() === prefix,
      );
      const attribution = locallyAdministered
        ? 'Locally administered: no vendor inference'
        : multicast
          ? 'Group address: no device-vendor inference'
          : (vendor?.vendor ?? 'No match in the bundled subset');
      setResult({
        ...calculation,
        title: 'MAC formatting and OUI lookup',
        summary: [
          ...calculation.summary,
          { label: 'Vendor lookup', value: attribution },
          { label: 'OUI reference coverage', value: ouiEntries.length + ' selected prefixes' },
        ],
        steps: [
          ...calculation.steps,
          {
            title: 'Interpret the organizational prefix carefully',
            description: locallyAdministered
              ? 'The locally administered bit is set. The address may be deliberately assigned or randomized; the first three bytes do not establish a manufacturer.'
              : 'For eligible universally administered unicast addresses, the first three bytes are compared with a bundled OUI subset. An assignment identifies a registrant, not proof of the device maker or identity.',
          },
        ],
        warnings: [
          ...calculation.warnings,
          'The bundled vendor list is a selected offline subset, not the complete IEEE registry. A missing match is not an invalid MAC address.',
        ],
        sources: [
          ...new Set([
            ...(calculation.sources ?? []),
            vendor?.source ?? 'https://standards.ieee.org/products-programs/regauth/',
          ]),
        ],
        data: { ...calculation.data, vendor: attribution, referenceEntries: ouiEntries.length },
      });
      setError('');
    } catch (caught) {
      setResult(null);
      setError(messageFrom(caught));
    }
  }
  return (
    <div className="stack">
      <Card>
        <form className="stack" onSubmit={submit}>
          <Field
            label="MAC address"
            hint="Enter 48 bits in colon, hyphen, dotted, or plain hexadecimal notation."
          >
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={32}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <div className="row">
            <Button type="submit">Format &amp; look up OUI</Button>
            <Badge>{ouiEntries.length} bundled prefixes</Badge>
          </div>
        </form>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </Card>
      {result && <ResultPanel result={result} />}
    </div>
  );
}

export function LookupTool({ kind }: { kind: 'dns' | 'ip-info' }) {
  const [query, setQuery] = useState(kind === 'dns' ? 'example.com' : '8.8.8.8');
  const [type, setType] = useState<keyof typeof dnsTypes>('A');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setError(
        kind === 'dns'
          ? 'Enter a domain name or a PTR lookup value.'
          : 'Enter an IPv4 or IPv6 address.',
      );
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await api<CalculationResult>('/lookups/' + kind, {
        method: 'POST',
        body: JSON.stringify(
          kind === 'dns' ? { name: query.trim(), type } : { address: query.trim() },
        ),
        signal: request.signal,
      });
      if (!request.signal.aborted) setResult(response);
    } catch (caught) {
      if (!request.signal.aborted) setError(messageFrom(caught));
    } finally {
      if (controller.current === request) setLoading(false);
    }
  }
  function cancel() {
    controller.current?.abort();
    setLoading(false);
    setError('Lookup cancelled.');
  }
  return (
    <div className="stack">
      <Card>
        <form className="stack" onSubmit={submit}>
          <div className="toolkit-filter-grid">
            <Field
              label={
                kind === 'dns'
                  ? type === 'PTR'
                    ? 'IP address or reverse name'
                    : 'Domain name'
                  : 'IP address'
              }
              hint={
                kind === 'dns'
                  ? 'Query a DNS name without a scheme, path, or port.'
                  : 'Use one literal address. Registration records describe allocation, not a device location.'
              }
            >
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={253}
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            {kind === 'dns' && (
              <Field label="Record type">
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value as keyof typeof dnsTypes)}
                >
                  {Object.keys(dnsTypes).map((recordType) => (
                    <option key={recordType}>{recordType}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {kind === 'dns' && <p className="muted">{dnsTypes[type]}</p>}
          <div className="row">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle size={17} className="toolkit-spin" aria-hidden="true" /> Looking up…
                </>
              ) : kind === 'dns' ? (
                'Look up records'
              ) : (
                'Look up registration'
              )}
            </Button>
            {loading && (
              <Button type="button" variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            )}
            <Badge>Online lookup</Badge>
          </div>
        </form>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <p className="muted toolkit-caption">
          {kind === 'dns'
            ? 'Results include the resolver, retrieval time, record TTLs, and cache status. Answers may differ between resolvers and networks.'
            : 'The API uses structured RDAP registration data, with a bounded legacy fallback where configured. Private and special-use addresses may have no public registration record.'}
        </p>
        <SourceLink
          href={
            kind === 'dns'
              ? 'https://www.rfc-editor.org/rfc/rfc1035.html'
              : 'https://www.rfc-editor.org/rfc/rfc9082.html'
          }
          label={kind === 'dns' ? 'DNS record standard' : 'RDAP query standard'}
        />
      </Card>
      {result && <ResultPanel result={result} />}
    </div>
  );
}
