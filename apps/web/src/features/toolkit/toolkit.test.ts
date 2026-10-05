import { describe, expect, it } from 'vitest';
import { parseIPv4, parseNetwork } from '@subnetiq/netcalc';
import { firewallDefaults, generateFirewall } from './firewall';
import { exampleVector, interpretCvss } from './cvss';
import { interpretHeaders } from './http';
import { assessPassword, hashText } from './local-security';
import { calculateTemplate, templateInput } from './templates';
import templates from '../../../../../data/network-templates.json';
import type { NetworkTemplate } from './types';

describe('firewall configuration boundaries', () => {
  it('normalizes a source CIDR and supplies a reversible exact iptables rule', () => {
    const result = generateFirewall({ ...firewallDefaults, source: '192.168.10.129/24' });
    expect(result.data?.configuration).toBe(
      'iptables -A INPUT -p tcp -s 192.168.10.0/24 --dport 443 -j ACCEPT',
    );
    expect(result.data?.check).toBe(
      'iptables -C INPUT -p tcp -s 192.168.10.0/24 --dport 443 -j ACCEPT',
    );
    expect(result.data?.remove).toBe(
      'iptables -D INPUT -p tcp -s 192.168.10.0/24 --dport 443 -j ACCEPT',
    );
  });
  it('translates a network to Cisco wildcard syntax and preserves the port range', () => {
    const result = generateFirewall({
      ...firewallDefaults,
      platform: 'cisco',
      source: '10.1.2.127/26',
      destination: '10.2.0.5',
      port: '8000-8080',
    });
    expect(result.data?.configuration).toBe(
      'ip access-list extended SUBNETIQ\n permit tcp 10.1.2.64 0.0.0.63 host 10.2.0.5 range 8000 8080',
    );
  });
  it('keeps UFW any-address rules confined to the selected address family', () => {
    const result = generateFirewall({
      ...firewallDefaults,
      platform: 'ufw',
      family: 6,
      source: 'any',
      destination: 'any',
    });
    expect(result.data?.configuration).toBe('ufw allow in from ::/0 to ::/0 port 443 proto tcp');
  });
  it('uses the IPv6 ICMP protocol in ip6tables', () => {
    const result = generateFirewall({
      ...firewallDefaults,
      family: 6,
      source: '2001:db8::1',
      protocol: 'icmp',
      port: '',
    });
    expect(result.data?.configuration).toBe(
      'ip6tables -A INPUT -p ipv6-icmp -s 2001:db8::1/128 -j ACCEPT',
    );
  });
  it.each(['10.0.0.1;whoami', '$(whoami)', 'example.com', '10.0.0.1\n-A OUTPUT', '10.999.0.0/16'])(
    'rejects unsafe or invalid address input %s',
    (source) => {
      expect(() => generateFirewall({ ...firewallDefaults, source })).toThrow();
    },
  );
  it.each(['0', '65536', '8080-80', '80,443', '80;id', '-1'])(
    'rejects ambiguous or invalid ports %s',
    (port) => {
      expect(() => generateFirewall({ ...firewallDefaults, port })).toThrow();
    },
  );
  it('does not silently reinterpret unsupported platform behavior', () => {
    expect(() =>
      generateFirewall({ ...firewallDefaults, platform: 'cisco', action: 'reject' }),
    ).toThrow('permit or deny');
    expect(() => generateFirewall({ ...firewallDefaults, protocol: 'icmp' })).toThrow(
      'Clear the port',
    );
    expect(() => generateFirewall({ ...firewallDefaults, family: 6 })).toThrow();
    expect(() =>
      generateFirewall({ ...firewallDefaults, platform: 'pfsense', direction: 'out' }),
    ).toThrow('incoming');
  });
  it('labels pfSense output as a worksheet and validates interface text', () => {
    const result = generateFirewall({ ...firewallDefaults, platform: 'pfsense', interface: 'LAN' });
    expect(result.title).toBe('pfSense rule worksheet');
    expect(result.warnings.join(' ')).toContain('not an importable configuration');
    expect(() =>
      generateFirewall({
        ...firewallDefaults,
        platform: 'pfsense',
        interface: 'LAN\nAction: Pass',
      }),
    ).toThrow();
  });
});

describe('CVSS 4.0 vector interpretation', () => {
  it('reads the complete Base vector without inventing a severity score', () => {
    const result = interpretCvss(exampleVector);
    expect(result.rows).toHaveLength(11);
    expect(result.rows?.[0]).toMatchObject({ key: 'AV', value: 'Network', group: 'Base' });
    expect(result.summary.find((field) => field.label === 'Numerical score')?.value).toBe(
      'Not calculated by this reader',
    );
  });
  it('accepts optional safety values and the case-sensitive provider urgency', () => {
    const result = interpretCvss(
      exampleVector + '/E:A/CR:H/MSI:S/MSA:S/S:P/AU:Y/R:U/V:C/RE:H/U:Amber',
    );
    expect(result.rows?.find((row) => row.key === 'MSI')?.value).toBe('Safety');
    expect(result.summary.find((field) => field.label === 'Metric groups')?.value).toBe('CVSS-BTE');
  });
  it('rejects missing, duplicate, misordered, and invalid metrics', () => {
    expect(() => interpretCvss(exampleVector.replace('/AT:N', ''))).toThrow('AT');
    expect(() => interpretCvss(exampleVector + '/E:A/E:X')).toThrow('more than once');
    expect(() => interpretCvss(exampleVector.replace('/AV:N/AC:L', '/AC:L/AV:N'))).toThrow('order');
    expect(() => interpretCvss(exampleVector + '/U:AMBER')).toThrow('case sensitive');
    expect(() => interpretCvss(exampleVector + '/constructor:X')).toThrow('Invalid CVSS');
    expect(() => interpretCvss(exampleVector.replace('CVSS:4.0', 'CVSS:3.1'))).toThrow();
  });
});

describe('local header interpretation', () => {
  it('redacts credentials from the entire serializable result', () => {
    const raw =
      'HTTP/1.1 200 OK\nAuthorization: Bearer secret-never-export\nSet-Cookie: session=cookie-never-export; Secure; HttpOnly\nX-API-Key: api-never-export\nContent-Type: application/json';
    const result = interpretHeaders(raw);
    const exported = JSON.stringify(result);
    expect(result.rows).toHaveLength(4);
    expect(exported).not.toContain('secret-never-export');
    expect(exported).not.toContain('cookie-never-export');
    expect(exported).not.toContain('api-never-export');
    expect(result.rows?.find((row) => row.name === 'content-type')?.value).toBe('application/json');
  });
  it('preserves duplicate fields while detecting dangerous framing ambiguity', () => {
    const result = interpretHeaders(
      'Content-Length: 10\nContent-Length: 20\nTransfer-Encoding: chunked',
    );
    expect(result.rows).toHaveLength(3);
    expect(result.warnings.join(' ')).toContain('Repeated Content-Length');
    expect(result.warnings.join(' ')).toContain('framing');
  });
  it('omits a message body and request query from the report', () => {
    const result = interpretHeaders(
      'GET /account?token=private-query HTTP/1.1\nHost: example.com\n\nprivate-body',
    );
    expect(JSON.stringify(result)).not.toContain('private-query');
    expect(JSON.stringify(result)).not.toContain('private-body');
  });
  it('rejects malformed lines and controls', () => {
    expect(() => interpretHeaders('Cookie session=bad')).toThrow('Line 1');
    expect(() => interpretHeaders('X-Name: a\u0000b')).toThrow('Line 1');
    expect(() => interpretHeaders('')).toThrow('Paste');
    expect(() => interpretHeaders('HTTP/1.1 200 OK\u0000')).toThrow('control character');
    expect(interpretHeaders('Constructor: example').sources).toEqual([]);
  });
});

describe('local password and digest privacy', () => {
  it('matches the SHA-256 published abc and empty-input digests', async () => {
    const abc = await hashText('abc', 'SHA-256');
    expect(abc.data?.hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const empty = await hashText('', 'SHA-256');
    expect(empty.data?.hex).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('preserves whitespace, encodes UTF-8, and excludes source input', async () => {
    const source = 'Private source value \u00E9\n';
    const result = await hashText(source, 'SHA-512');
    expect(result.normalizedInput.byteLength).toBe(new TextEncoder().encode(source).length);
    expect(String(result.data?.hex)).toHaveLength(128);
    expect(JSON.stringify(result)).not.toContain(source);
    expect((await hashText('abc ', 'SHA-256')).data?.hex).not.toBe(
      (await hashText('abc', 'SHA-256')).data?.hex,
    );
  });
  it('excludes passwords and the zxcvbn match model from exported assessment', async () => {
    const source = 'NeverExportThisPassword938_Example';
    const result = await assessPassword(source);
    expect(JSON.stringify(result)).not.toContain(source);
    expect(result.data).not.toHaveProperty('sequence');
    expect(result.normalizedInput.inputIncluded).toBe(false);
    expect((await assessPassword('password')).data?.score).toBe(0);
  });
});

describe('four network template plans', () => {
  it.each(templates as NetworkTemplate[])(
    '$name has sufficient, aligned, non-overlapping allocations with valid gateways',
    (template) => {
      const result = calculateTemplate(template);
      expect(result.blocks).toHaveLength(template.segments.length);
      expect(templateInput(template).segments.every((segment) => Boolean(segment.lockedCidr))).toBe(
        true,
      );
      const parent = parseNetwork(template.network, 4);
      const seen: { start: bigint; end: bigint }[] = [];
      for (const segment of template.segments) {
        const block = result.blocks?.find((item) => item.name === segment.name);
        expect(block).toBeDefined();
        const network = parseNetwork(block!.cidr, 4);
        expect(network.start >= parent.start && network.end <= parent.end).toBe(true);
        expect(network.size - 2n >= BigInt(segment.hosts)).toBe(true);
        expect(seen.every((other) => network.end < other.start || network.start > other.end)).toBe(
          true,
        );
        const gateway = parseIPv4(segment.gateway!);
        expect(gateway > network.start && gateway < network.end).toBe(true);
        expect(parseNetwork(segment.ipv6!, 6).prefix).toBe(64);
        seen.push(network);
      }
    },
  );
});
