import { type FormEvent, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import type { CalculationResult } from '@subnetiq/shared';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { firewallDefaults, generateFirewall, type FirewallInput } from './firewall';
import { assessPassword, hashText, type DigestAlgorithm } from './local-security';
import { messageFrom } from './results';

export function FirewallTool() {
  const [input, setInput] = useState<FirewallInput>(firewallDefaults);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  function change<K extends keyof FirewallInput>(key: K, value: FirewallInput[K]) {
    setInput((previous) => ({ ...previous, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setResult(generateFirewall(input));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(messageFrom(caught));
    }
  }
  return (
    <div className="stack">
      <Card className="no-print">
        <form onSubmit={submit} className="stack">
          <div className="grid-3">
            <Field label="Platform">
              <Select
                value={input.platform}
                onChange={(event) => {
                  const platform = event.target.value as FirewallInput['platform'];
                  setInput((previous) => ({
                    ...previous,
                    platform,
                    direction: platform === 'pfsense' ? 'in' : previous.direction,
                  }));
                }}
              >
                <option value="iptables">iptables / ip6tables</option>
                <option value="ufw">UFW</option>
                <option value="cisco">Cisco extended ACL</option>
                <option value="pfsense">pfSense worksheet</option>
              </Select>
            </Field>
            <Field label="Address family">
              <Select
                value={input.family}
                onChange={(event) => change('family', Number(event.target.value) as 4 | 6)}
              >
                <option value={4}>IPv4</option>
                <option value={6}>IPv6</option>
              </Select>
            </Field>
            <Field label="Action">
              <Select
                value={input.action}
                onChange={(event) =>
                  change('action', event.target.value as FirewallInput['action'])
                }
              >
                <option value="allow">Allow / pass</option>
                <option value="deny">Deny / drop</option>
                <option value="reject" disabled={input.platform === 'cisco'}>
                  Reject with response
                </option>
              </Select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Source address or CIDR" hint="Use any to match all sources.">
              <Input
                value={input.source}
                onChange={(event) => change('source', event.target.value)}
                maxLength={80}
                spellCheck={false}
              />
            </Field>
            <Field label="Destination address or CIDR">
              <Input
                value={input.destination}
                onChange={(event) => change('destination', event.target.value)}
                maxLength={80}
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Protocol">
              <Select
                value={input.protocol}
                onChange={(event) => {
                  const protocol = event.target.value as FirewallInput['protocol'];
                  setInput((previous) => ({
                    ...previous,
                    protocol,
                    port: ['tcp', 'udp'].includes(protocol) ? previous.port : '',
                  }));
                }}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp" disabled={input.platform === 'ufw'}>
                  ICMP / ICMPv6
                </option>
                <option value="any">Any protocol</option>
              </Select>
            </Field>
            <Field label="Destination port" hint="One port or an inclusive range; blank means any.">
              <Input
                value={input.port}
                onChange={(event) => change('port', event.target.value)}
                maxLength={11}
                disabled={!['tcp', 'udp'].includes(input.protocol)}
                placeholder="443 or 8000-8080"
              />
            </Field>
            <Field label="Direction">
              <Select
                value={input.direction}
                onChange={(event) =>
                  change('direction', event.target.value as FirewallInput['direction'])
                }
              >
                <option value="in">Incoming</option>
                <option value="out" disabled={input.platform === 'pfsense'}>
                  Outgoing
                </option>
                <option value="forward" disabled={input.platform === 'pfsense'}>
                  Forwarded traffic
                </option>
              </Select>
            </Field>
          </div>
          {input.platform === 'pfsense' && (
            <Field label="Incoming pfSense interface">
              <Input
                value={input.interface}
                onChange={(event) => change('interface', event.target.value)}
                maxLength={32}
              />
            </Field>
          )}
          <div className="row">
            <Button type="submit">
              {input.platform === 'pfsense' ? 'Create worksheet' : 'Generate rule'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setInput(firewallDefaults);
                setResult(null);
                setError('');
              }}
            >
              Reset example
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
    </div>
  );
}

export function PasswordTool() {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const operation = useRef(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = ++operation.current;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const assessment = await assessPassword(password);
      if (current === operation.current) setResult(assessment);
    } catch (caught) {
      if (current === operation.current) setError(messageFrom(caught));
    } finally {
      if (current === operation.current) setLoading(false);
    }
  }
  function clear() {
    operation.current += 1;
    setPassword('');
    setResult(null);
    setError('');
    setVisible(false);
    setLoading(false);
  }
  const score = Number(result?.data?.score ?? 0);
  return (
    <div className="stack">
      <Card className="no-print">
        <Badge>Local processing</Badge>
        <p className="muted">
          Assess a practice password in this tab. The input is excluded from saved results, URLs, AI
          context, and exports.
        </p>
        <form onSubmit={submit} className="stack">
          <Field
            label="Password to assess"
            hint="Up to 256 characters. Pattern estimates are primarily tuned to English."
          >
            <div className="toolkit-password-input">
              <Input
                aria-label="Password to assess"
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  operation.current += 1;
                  setPassword(event.target.value);
                  setResult(null);
                  setLoading(false);
                }}
                autoComplete="new-password"
                spellCheck={false}
                maxLength={256}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </Button>
            </div>
          </Field>
          <div className="row">
            <Button type="submit" disabled={loading || password.length === 0}>
              {loading ? (
                <>
                  <LoaderCircle className="toolkit-spin" size={17} aria-hidden="true" /> Assessing…
                </>
              ) : (
                'Assess strength'
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={clear}>
              Clear input &amp; result
            </Button>
          </div>
        </form>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div
            className="toolkit-strength"
            role="meter"
            aria-label="Estimated password strength"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={score}
            aria-valuetext={String(result.summary[0]?.value)}
          >
            {[0, 1, 2, 3, 4].map((index) => (
              <span key={index} className={index <= score ? 'filled strength-' + score : ''} />
            ))}
          </div>
        )}
      </Card>
      {result && <ResultPanel result={result} />}
    </div>
  );
}

export function HashTool() {
  const [text, setText] = useState('');
  const [algorithm, setAlgorithm] = useState<DigestAlgorithm>('SHA-256');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const operation = useRef(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = ++operation.current;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const digest = await hashText(text, algorithm);
      if (current === operation.current) setResult(digest);
    } catch (caught) {
      if (current === operation.current) setError(messageFrom(caught));
    } finally {
      if (current === operation.current) setLoading(false);
    }
  }
  function clear() {
    operation.current += 1;
    setText('');
    setResult(null);
    setError('');
    setLoading(false);
  }
  return (
    <div className="stack">
      <Card className="no-print">
        <Badge>Web Crypto · local processing</Badge>
        <form onSubmit={submit} className="stack">
          <Field
            label="Source text"
            hint="Spaces and line breaks are preserved. Empty text is a valid digest input."
          >
            <Textarea
              value={text}
              onChange={(event) => {
                operation.current += 1;
                setText(event.target.value);
                setResult(null);
                setLoading(false);
              }}
              rows={5}
              maxLength={100000}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Digest algorithm">
            <Select
              value={algorithm}
              onChange={(event) => {
                operation.current += 1;
                setAlgorithm(event.target.value as DigestAlgorithm);
                setResult(null);
                setLoading(false);
              }}
            >
              <option>SHA-256</option>
              <option>SHA-384</option>
              <option>SHA-512</option>
            </Select>
          </Field>
          <div className="row">
            <Button type="submit" disabled={loading}>
              {loading ? 'Computing…' : 'Generate digest'}
            </Button>
            <Button type="button" variant="secondary" onClick={clear}>
              Clear input &amp; result
            </Button>
          </div>
        </form>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <p className="muted toolkit-caption">
          The source text stays in this tab. Exported results contain the digest and size metadata;
          predictable sensitive input can still be guessed from its digest.
        </p>
      </Card>
      {result && <ResultPanel result={result} />}
    </div>
  );
}
