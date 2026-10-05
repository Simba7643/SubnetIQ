import { describe, expect, it, jest } from '@jest/globals';
import {
  addressInCidr,
  isPublicDestination,
  resolvePublicAddress,
  SafeJsonTransport,
} from '../src/security/network.js';
import { createLookupService, normalizeDnsName } from '../src/services/lookups/index.js';
import { MemoryLookupCache } from '../src/services/lookups/cache.js';
import { MemoryQuotaStore, PostgresQuotaStore } from '../src/middleware/quota.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('lookup destination boundaries', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '192.0.2.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    '2002:7f00:1::',
    'fe80::1%eth0',
  ])('blocks nonpublic destination %s', (address) => {
    expect(isPublicDestination(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'permits a public destination %s',
    (address) => {
      expect(isPublicDestination(address)).toBe(true);
    },
  );
  it('rejects mixed public/private DNS answers to prevent rebinding', async () => {
    await expect(
      resolvePublicAddress('rdap.arin.net', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toMatchObject({ code: 'UNSAFE_UPSTREAM' });
  });
  it('chooses only a previously checked public address', async () => {
    const resolver = jest.fn(async () => [
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '1.1.1.1', family: 4 },
    ]);
    expect(await resolvePublicAddress('cloudflare-dns.com', resolver)).toEqual({
      address: '1.1.1.1',
      family: 4,
    });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
  it.each([
    'http://cloudflare-dns.com/dns-query',
    'https://evil.example/',
    'https://cloudflare-dns.com:8443/',
    'https://name:secret@cloudflare-dns.com/',
  ])('rejects unapproved URL %s before DNS or connection', async (url) => {
    const resolver = jest.fn(async () => [{ address: '1.1.1.1', family: 4 }]);
    await expect(
      new SafeJsonTransport(5000, 1000, resolver).get(new URL(url)),
    ).rejects.toMatchObject({ code: 'UNAPPROVED_UPSTREAM' });
    expect(resolver).not.toHaveBeenCalled();
  });
  it('handles CIDR membership for IPv4 and compressed IPv6', () => {
    expect(addressInCidr('8.8.8.8', '8.0.0.0/8')).toBe(true);
    expect(addressInCidr('8.8.8.8', '9.0.0.0/8')).toBe(false);
    expect(addressInCidr('2606:4700:4700::1111', '2606:4700::/32')).toBe(true);
    expect(addressInCidr('8.8.8.8', '::/0')).toBe(false);
  });
});

describe('DNS lookup semantics and bounded cache', () => {
  it('converts PTR addresses and rejects URL/control inputs', () => {
    expect(normalizeDnsName('8.8.4.4', 'PTR')).toBe('4.4.8.8.in-addr.arpa');
    expect(normalizeDnsName('::1', 'PTR')).toBe(`1.${Array(31).fill('0').join('.')}.ip6.arpa`);
    expect(normalizeDnsName('Example.COM.', 'A')).toBe('example.com');
    expect(normalizeDnsName('_dmarc.example.com', 'TXT')).toBe('_dmarc.example.com');
    expect(() => normalizeDnsName('https://example.com/', 'A')).toThrow();
    expect(() => normalizeDnsName('example.com\r\nGET /', 'A')).toThrow();
  });
  it('queries only the configured resolver and retains provenance through cache hits', async () => {
    const get = jest.fn(async (url: URL) => ({
      value: {
        Status: 0,
        AD: false,
        Answer: [{ name: 'example.com', type: 1, TTL: 30, data: '192.0.2.1' }],
      },
      source: url.toString(),
      status: 200,
    }));
    const service = createLookupService({ get }, new MemoryLookupCache());
    const first = await service.dns({ name: 'example.com', type: 'A' });
    const second = await service.dns({ name: 'example.com', type: 'A' });
    expect(first.toolId).toBe('dns');
    expect(first.rows?.[0]?.value).toBe('192.0.2.1');
    expect(first.data?.cached).toBe(false);
    expect(second.data?.cached).toBe(true);
    expect(second.data?.retrievedAt).toBe(first.data?.retrievedAt);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0].origin).toBe('https://cloudflare-dns.com');
  });
  it('expires values and honors zero TTL', async () => {
    let now = 0;
    const cache = new MemoryLookupCache(() => now);
    await cache.set('item', 'dns', { value: 1 }, 10);
    expect(await cache.get('item')).toEqual({ value: 1 });
    now = 10001;
    expect(await cache.get('item')).toBeNull();
    await cache.set('zero', 'dns', { value: 2 }, 0);
    expect(await cache.get('zero')).toBeNull();
  });
  it('uses longest matching IANA registration prefix and rejects an unapproved bootstrap target', async () => {
    const get = jest.fn(async (url: URL) => ({
      value:
        url.hostname === 'data.iana.org'
          ? {
              services: [
                [['8.0.0.0/8'], ['https://rdap.arin.net/registry/']],
                [['8.8.0.0/16'], ['https://rdap.apnic.net/']],
                [['8.8.8.0/24'], ['https://untrusted.example/']],
              ],
            }
          : {
              name: 'Example registration',
              ipVersion: 'v4',
              startAddress: '8.8.8.0',
              endAddress: '8.8.8.255',
            },
      source: url.toString(),
      status: 200,
    }));
    const result = await createLookupService({ get }, new MemoryLookupCache()).ipInfo({
      address: '8.8.8.8',
    });
    expect(result.summary.find((field) => field.label === 'Registry')?.value).toBe(
      'rdap.apnic.net',
    );
    expect(get.mock.calls[1]?.[0].toString()).toBe('https://rdap.apnic.net/ip/8.8.8.8');
  });
});

describe('quota semantics', () => {
  it('allows a bounded number, isolates identities, then resets after expiry', async () => {
    let now = 0;
    const store = new MemoryQuotaStore(() => now);
    expect((await store.consume('a', 'test', 2, 60)).allowed).toBe(true);
    expect((await store.consume('a', 'test', 2, 60)).remaining).toBe(0);
    expect((await store.consume('a', 'test', 2, 60)).allowed).toBe(false);
    expect((await store.consume('b', 'test', 2, 60)).allowed).toBe(true);
    now = 60001;
    expect((await store.consume('a', 'test', 2, 60)).remaining).toBe(1);
  });
  it('uses the atomic database quota RPC with a hashed subject', async () => {
    const rpc = jest.fn(async () => ({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 42 }],
      error: null,
    }));
    const store = new PostgresQuotaStore({ rpc } as unknown as SupabaseClient);
    expect(await store.consume('hashed-subject', 'ai-day', 30, 86400)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    expect(rpc).toHaveBeenCalledWith('consume_api_quota', {
      p_subject: 'hashed-subject',
      p_scope: 'ai-day',
      p_limit: 30,
      p_window_seconds: 86400,
      p_cost: 1,
    });
  });
});
