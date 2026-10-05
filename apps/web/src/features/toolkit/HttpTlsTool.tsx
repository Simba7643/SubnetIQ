import { type FormEvent, useState } from 'react';
import type { CalculationResult } from '@subnetiq/shared';
import { LockKeyhole } from 'lucide-react';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { interpretHeaders, tlsSteps } from './http';
import { messageFrom, toolkitResult } from './results';
import { SourceLink } from './ReferenceTools';

const exampleHeaders = [
  'HTTP/1.1 200 OK',
  'Content-Type: application/json; charset=utf-8',
  'Cache-Control: no-store',
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
].join('\n');
const statusNames: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};
const methodRows = [
  { method: 'GET', safe: 'Yes', idempotent: 'Yes', meaning: 'Retrieve a representation.' },
  {
    method: 'HEAD',
    safe: 'Yes',
    idempotent: 'Yes',
    meaning: 'Retrieve response metadata without response content.',
  },
  {
    method: 'POST',
    safe: 'No',
    idempotent: 'Not guaranteed',
    meaning: 'Ask the target to process supplied content.',
  },
  {
    method: 'PUT',
    safe: 'No',
    idempotent: 'Yes',
    meaning: 'Create or replace the target representation.',
  },
  {
    method: 'PATCH',
    safe: 'No',
    idempotent: 'Not guaranteed',
    meaning: 'Apply a set of modifications.',
  },
  {
    method: 'DELETE',
    safe: 'No',
    idempotent: 'Yes',
    meaning: 'Remove the association with the target resource.',
  },
  { method: 'OPTIONS', safe: 'Yes', idempotent: 'Yes', meaning: 'Describe communication options.' },
];

export default function HttpTlsTool() {
  const [view, setView] = useState<'headers' | 'tls' | 'http'>('headers');
  const [raw, setRaw] = useState(exampleHeaders);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  const [selectedStep, setSelectedStep] = useState(0);
  const [status, setStatus] = useState('200');
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setResult(interpretHeaders(raw));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(messageFrom(caught));
    }
  }
  const methodResult = toolkitResult(
    'http-reference',
    'HTTP methods and status classes',
    {},
    [
      { label: 'Safe method', value: 'Its defined semantics are essentially read-only.' },
      {
        label: 'Idempotent method',
        value: 'Repeated identical requests have the same intended server effect as one request.',
      },
    ],
    {
      rows: methodRows,
      columns: [
        { key: 'method', label: 'Method' },
        { key: 'safe', label: 'Safe' },
        { key: 'idempotent', label: 'Idempotent' },
        { key: 'meaning', label: 'Purpose' },
      ],
      warnings: [
        'Safety and idempotence describe intended semantics. They do not guarantee that an application is secure, has no incidental logging, or returns identical responses.',
      ],
      sources: [
        'https://www.rfc-editor.org/rfc/rfc9110.html',
        'https://www.rfc-editor.org/rfc/rfc5789.html',
      ],
      steps: [
        {
          title: 'Interpret status codes by class',
          description:
            '1xx is informational; 2xx is successful; 3xx requests further action or cache reuse; 4xx concerns the request; 5xx concerns server-side fulfillment.',
        },
      ],
    },
  );
  const tlsResult = toolkitResult(
    'tls-reference',
    'TLS 1.3 handshake reference',
    { handshake: 'Certificate-based TLS 1.3' },
    [
      { label: 'Protocol', value: 'TLS 1.3' },
      {
        label: 'Protection',
        value: 'Confidentiality, integrity, and peer authentication as configured',
      },
      { label: 'Selected step', value: tlsSteps[selectedStep]?.title ?? '' },
    ],
    {
      steps: tlsSteps,
      warnings: [
        'This is a conceptual full handshake. Resumption, 0-RTT data, client certificates, and HelloRetryRequest alter the exchange. TLS does not hide all traffic metadata or make the application trustworthy.',
      ],
      sources: [
        'https://www.rfc-editor.org/info/rfc9846/',
        'https://www.rfc-editor.org/rfc/rfc9525.html',
      ],
    },
  );
  const code = Number(status);
  const validCode = /^\d{3}$/.test(status) && code >= 100 && code <= 599;
  const category = ['Informational', 'Successful', 'Redirection', 'Client error', 'Server error'][
    Math.floor(code / 100) - 1
  ];
  return (
    <div className="stack">
      <Card>
        <div className="row toolkit-mode" aria-label="HTTP and TLS section">
          {(['headers', 'tls', 'http'] as const).map((item) => (
            <Button
              key={item}
              variant={view === item ? 'primary' : 'secondary'}
              onClick={() => setView(item)}
              aria-pressed={view === item}
            >
              {item === 'headers'
                ? 'Header interpreter'
                : item === 'tls'
                  ? 'TLS 1.3'
                  : 'HTTP fundamentals'}
            </Button>
          ))}
        </div>
      </Card>
      {view === 'headers' && (
        <>
          <Card className="no-print">
            <Badge>Local interpretation</Badge>
            <form onSubmit={submit} className="stack">
              <Field
                label="HTTP headers"
                hint="Paste a header block. Recognized credential and cookie values are redacted from the report."
              >
                <Textarea
                  value={raw}
                  onChange={(event) => setRaw(event.target.value)}
                  rows={10}
                  maxLength={32000}
                  spellCheck={false}
                />
              </Field>
              <div className="row">
                <Button type="submit">Interpret headers</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRaw(exampleHeaders);
                    setResult(null);
                    setError('');
                  }}
                >
                  Load example
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRaw('');
                    setResult(null);
                    setError('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </form>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
          </Card>
          {result && <ResultPanel result={result} />}
        </>
      )}
      {view === 'tls' && (
        <>
          <div className="grid-2">
            <Card>
              <div className="row">
                <LockKeyhole size={20} aria-hidden="true" />
                <h2>Establish a protected connection</h2>
              </div>
              <div className="toolkit-tls-steps">
                {tlsSteps.map((step, index) => (
                  <button
                    key={step.title}
                    onClick={() => setSelectedStep(index)}
                    className={'toolkit-tls-step ' + (selectedStep === index ? 'selected' : '')}
                    aria-pressed={selectedStep === index}
                  >
                    <span>{index + 1}</span>
                    <strong>{step.title}</strong>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <Badge>Step {selectedStep + 1}</Badge>
              <h2>{tlsSteps[selectedStep]?.title}</h2>
              <p>{tlsSteps[selectedStep]?.description}</p>
              <h3>Certificate validation matters</h3>
              <p className="muted">
                The client must verify trust and the expected service identity. An encrypted session
                to an impersonator would not provide the intended protection.
              </p>
              <SourceLink
                href="https://www.rfc-editor.org/rfc/rfc9525.html"
                label="TLS service identity"
              />
            </Card>
          </div>
          <ResultPanel result={tlsResult} />
        </>
      )}
      {view === 'http' && (
        <>
          <Card>
            <Field label="Look up a status code">
              <Input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                inputMode="numeric"
                maxLength={3}
              />
            </Field>
            <div className="toolkit-status-code" aria-live="polite">
              {validCode ? (
                <>
                  <strong>{code}</strong>
                  <div>
                    <h2>{statusNames[code] ?? 'No named entry in the bundled subset'}</h2>
                    <p className="muted">{category} class</p>
                  </div>
                </>
              ) : (
                <p className="muted">Enter a three-digit status code from 100 through 599.</p>
              )}
            </div>
            <SourceLink
              href="https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml"
              label="IANA status code registry"
            />
          </Card>
          <ResultPanel result={methodResult} />
        </>
      )}
    </div>
  );
}
