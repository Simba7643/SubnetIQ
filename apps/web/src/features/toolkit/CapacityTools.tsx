import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculate } from '@subnetiq/netcalc';
import type { CalculationResult } from '@subnetiq/shared';
import { ResultPanel } from '@/components/ResultPanel';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { messageFrom } from './results';

export default function CapacityTools({ kind }: { kind: 'bandwidth' | 'mtu' }) {
  const [size, setSize] = useState('1');
  const [sizeUnit, setSizeUnit] = useState('GB');
  const [speed, setSpeed] = useState('100');
  const [speedUnit, setSpeedUnit] = useState('Mbps');
  const [efficiency, setEfficiency] = useState('90');
  const [mtu, setMtu] = useState('1500');
  const [ipVersion, setIpVersion] = useState('4');
  const [tcpOptions, setTcpOptions] = useState('0');
  const [encapsulation, setEncapsulation] = useState('0');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const input =
        kind === 'bandwidth'
          ? {
              size: Number(size),
              sizeUnit,
              speed: Number(speed),
              speedUnit,
              efficiency: Number(efficiency),
            }
          : {
              mtu: Number(mtu),
              ipVersion: Number(ipVersion),
              tcpOptions: Number(tcpOptions),
              encapsulation: Number(encapsulation),
            };
      setResult(calculate(kind, input));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(messageFrom(caught));
    }
  }
  return (
    <div className="stack">
      <Card>
        <Badge>{kind === 'bandwidth' ? 'Units & throughput' : 'Packet budget'}</Badge>
        <form className="stack" onSubmit={submit}>
          {kind === 'bandwidth' ? (
            <>
              <div className="grid-2">
                <Field label="Data size">
                  <Input
                    type="number"
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    min="0"
                    step="any"
                    required
                  />
                </Field>
                <Field label="Size unit">
                  <Select value={sizeUnit} onChange={(event) => setSizeUnit(event.target.value)}>
                    {['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB'].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Link rate">
                  <Input
                    type="number"
                    value={speed}
                    onChange={(event) => setSpeed(event.target.value)}
                    min="0.000001"
                    step="any"
                    required
                  />
                </Field>
                <Field label="Rate unit">
                  <Select value={speedUnit} onChange={(event) => setSpeedUnit(event.target.value)}>
                    {['bps', 'Kbps', 'Mbps', 'Gbps'].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Effective throughput (% of link rate)"
                hint="Account for expected overhead and contention. This value is an assumption, not a speed test."
              >
                <Input
                  type="number"
                  value={efficiency}
                  onChange={(event) => setEfficiency(event.target.value)}
                  min="0.01"
                  max="100"
                  step="any"
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <div className="grid-2">
                <Field label="Link MTU (bytes)">
                  <Input
                    type="number"
                    value={mtu}
                    onChange={(event) => setMtu(event.target.value)}
                    min="68"
                    max="65535"
                    step="1"
                    required
                  />
                </Field>
                <Field label="Inner IP version">
                  <Select value={ipVersion} onChange={(event) => setIpVersion(event.target.value)}>
                    <option value="4">IPv4</option>
                    <option value="6">IPv6</option>
                  </Select>
                </Field>
              </div>
              <div className="grid-2">
                <Field
                  label="TCP options budget (bytes)"
                  hint="Use 0–40 bytes in multiples of four."
                >
                  <Input
                    type="number"
                    value={tcpOptions}
                    onChange={(event) => setTcpOptions(event.target.value)}
                    min="0"
                    max="40"
                    step="4"
                    required
                  />
                </Field>
                <Field
                  label="Additional encapsulation (bytes)"
                  hint="Enter overhead deducted from the link MTU before the inner packet."
                >
                  <Input
                    type="number"
                    value={encapsulation}
                    onChange={(event) => setEncapsulation(event.target.value)}
                    min="0"
                    max="65500"
                    step="1"
                    required
                  />
                </Field>
              </div>
            </>
          )}
          <div className="row">
            <Button type="submit">
              Calculate {kind === 'bandwidth' ? 'transfer time' : 'MSS & payload budget'}
            </Button>
            <Link className="button button-secondary" to={'/tools/' + kind}>
              Open full calculator
            </Link>
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
