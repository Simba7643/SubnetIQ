import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { z } from 'zod';
import type { CalculationResult, CellValue } from '@subnetiq/shared';
import { AppError } from '../../middleware/errors.js';
import {
  addressInCidr,
  approvedOrigins,
  ipNumber,
  safeWhois,
  type JsonTransport,
} from '../../security/network.js';
import type { LookupCache } from './cache.js';

export const dnsTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'PTR'] as const;
export const dnsSchema = z
  .object({ name: z.string().trim().min(1).max(253), type: z.enum(dnsTypes) })
  .strict();
export const ipInfoSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1)
      .max(45)
      .refine(
        (value) => Boolean(isIP(value)) && !value.includes('%'),
        'Enter one IPv4 or IPv6 address without a prefix or URL.',
      ),
  })
  .strict();
type DnsInput = z.infer<typeof dnsSchema>;
export interface LookupService {
  dns(input: DnsInput): Promise<CalculationResult>;
  ipInfo(input: { address: string }): Promise<CalculationResult>;
}

export function normalizeDnsName(name: string, type: DnsInput['type']): string {
  if (type === 'PTR' && isIP(name)) {
    if (name.includes('%'))
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Zone identifiers are not accepted for reverse DNS.',
      );
    const ip = ipNumber(name);
    return ip.bits === 32
      ? `${name.split('.').reverse().join('.')}.in-addr.arpa`
      : `${ip.value.toString(16).padStart(32, '0').split('').reverse().join('.')}.ip6.arpa`;
  }
  if (name.includes('/') || name.includes(':') || name.includes('@') || /\s/.test(name))
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Enter a DNS name, not a URL, port, or email address.',
    );
  const normalized = domainToASCII(name.replace(/\.$/, '')).toLowerCase();
  if (
    !normalized ||
    normalized.length > 253 ||
    !normalized.split('.').every((label) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))
  )
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Enter a valid DNS name with labels of at most 63 characters.',
    );
  return normalized;
}

const recordNames: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
};
const explanations: Record<DnsInput['type'], string> = {
  A: 'A records map a DNS name to IPv4 addresses.',
  AAAA: 'AAAA records map a DNS name to IPv6 addresses.',
  MX: 'MX records identify mail exchangers. A lower preference number is tried first.',
  TXT: 'TXT records store text used for verification and policies such as SPF and DKIM. Text is displayed as data.',
  NS: 'NS records identify authoritative nameservers for a DNS zone.',
  CNAME:
    'CNAME records identify a canonical name. Returned aliases are displayed without making HTTP requests to them.',
  PTR: 'PTR records map an address reverse name to a hostname. Forward and reverse records can differ.',
};

const dnsResponseSchema = z
  .object({
    Status: z.number().int(),
    AD: z.boolean().optional(),
    CD: z.boolean().optional(),
    Answer: z
      .array(
        z.object({
          name: z.string(),
          type: z.number(),
          TTL: z.number().nonnegative(),
          data: z.string(),
        }),
      )
      .max(1000)
      .optional(),
    Authority: z
      .array(
        z.object({
          name: z.string(),
          type: z.number(),
          TTL: z.number().nonnegative(),
          data: z.string(),
        }),
      )
      .max(1000)
      .optional(),
  })
  .passthrough();

const bootstrapSchema = z
  .object({
    services: z.array(z.tuple([z.array(z.string()), z.array(z.string())])).max(10000),
    publication: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();
type Bootstrap = z.infer<typeof bootstrapSchema>;

function cacheMarked(result: CalculationResult): CalculationResult {
  const copied = structuredClone(result);
  copied.summary = copied.summary.map((field) =>
    field.label === 'Cache' ? { ...field, value: 'Cached response' } : field,
  );
  copied.data = { ...copied.data, cached: true };
  return copied;
}

function plainString(value: unknown, fallback = 'Not supplied'): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 2000) : fallback;
}

export function createLookupService(
  transport: JsonTransport,
  cache: LookupCache,
  options: { maxConcurrent?: number; whoisFallback?: boolean; timeoutMs?: number } = {},
): LookupService {
  let active = 0;
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= (options.maxConcurrent ?? 8))
      throw new AppError(503, 'LOOKUP_BUSY', 'The lookup service is busy. Retry shortly.');
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
    }
  }

  async function bootstrap(address: string): Promise<{ base: URL; publication: string }> {
    const family = isIP(address) === 4 ? 'ipv4' : 'ipv6';
    const key = `bootstrap:${family}:1`;
    let data = await cache.get<Bootstrap>(key);
    if (!data) {
      const fetched = await transport.get(
        new URL(`https://data.iana.org/rdap/${family}.json`),
        'application/json',
      );
      const parsed = bootstrapSchema.safeParse(fetched.value);
      if (!parsed.success)
        throw new AppError(
          502,
          'UPSTREAM_FORMAT',
          'The IANA bootstrap response has an unexpected format.',
        );
      data = parsed.data;
      await cache.set(key, 'bootstrap', data, 86400);
    }
    const candidates: Array<{ base: URL; prefix: number }> = [];
    for (const [prefixes, services] of data.services) {
      for (const prefix of prefixes) {
        if (!addressInCidr(address, prefix)) continue;
        for (const service of services) {
          let base: URL;
          try {
            base = new URL(service);
          } catch {
            continue;
          }
          if (
            !approvedOrigins.has(base.origin) ||
            base.protocol !== 'https:' ||
            base.hostname === 'data.iana.org' ||
            base.hostname === 'cloudflare-dns.com' ||
            base.username ||
            base.password ||
            base.search ||
            base.hash
          )
            continue;
          candidates.push({ base, prefix: Number(prefix.split('/')[1]) });
        }
      }
    }
    candidates.sort((a, b) => b.prefix - a.prefix);
    if (!candidates[0])
      throw new AppError(
        404,
        'LOOKUP_NOT_FOUND',
        'No approved public RDAP registry covers this address. Private and special-use addresses may have no public registration record.',
      );
    return { base: candidates[0].base, publication: data.publication ?? 'Not supplied' };
  }

  return {
    async dns(input) {
      const validated = dnsSchema.parse(input);
      const name = normalizeDnsName(validated.name, validated.type);
      const cacheKey = `dns:${validated.type}:${name}:1`;
      const cached = await cache.get<CalculationResult>(cacheKey);
      if (cached) return cacheMarked(cached);
      return bounded(async () => {
        const url = new URL('https://cloudflare-dns.com/dns-query');
        url.searchParams.set('name', name);
        url.searchParams.set('type', validated.type);
        const response = await transport.get(url, 'application/dns-json');
        const parsed = dnsResponseSchema.safeParse(response.value);
        if (!parsed.success)
          throw new AppError(
            502,
            'UPSTREAM_FORMAT',
            'The DNS resolver returned an unexpected response.',
          );
        const data = parsed.data;
        if (![0, 3].includes(data.Status))
          throw new AppError(
            502,
            'DNS_FAILURE',
            `The resolver returned DNS status ${data.Status}. Retry or check the authoritative configuration.`,
          );
        const retrievedAt = new Date().toISOString();
        const records = data.Answer ?? [];
        const result: CalculationResult = {
          toolId: 'dns',
          title: `${validated.type} lookup for ${name}`,
          normalizedInput: { name, type: validated.type },
          engineVersion: 'lookup-1.0.0',
          summary: [
            { label: 'Query', value: name },
            { label: 'Record type', value: validated.type },
            {
              label: 'DNS status',
              value:
                data.Status === 3
                  ? 'NXDOMAIN (name does not exist)'
                  : records.length
                    ? 'NOERROR'
                    : 'NOERROR (no answer of the requested type)',
            },
            { label: 'Answer records', value: records.length },
            {
              label: 'DNSSEC authenticated data',
              value: data.AD === true ? 'Yes, as reported by resolver' : 'Not asserted by resolver',
            },
            { label: 'Retrieved', value: retrievedAt },
            { label: 'Cache', value: 'Fresh response' },
          ],
          rows: records.map((record) => ({
            name: record.name,
            type: recordNames[record.type] ?? String(record.type),
            ttl: record.TTL,
            value: record.data,
          })),
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type' },
            { key: 'ttl', label: 'TTL (seconds at retrieval)' },
            { key: 'value', label: 'Value' },
          ],
          steps: [
            { title: 'Record meaning', description: explanations[validated.type] },
            {
              title: 'Resolution',
              description:
                'The configured Cloudflare resolver received this DNS question over HTTPS. The queried name was never used as an HTTP destination.',
            },
            {
              title: 'Time and cache',
              description:
                'DNS answers change. TTL values describe the resolver answer when it was retrieved. Cached results retain their original retrieval time.',
            },
          ],
          warnings: [
            'DNS is public lookup data. Do not enter confidential internal hostnames into a public resolver.',
          ],
          data: { source: response.source, retrievedAt, cached: false, raw: data },
          sources: [
            response.source,
            'https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/',
          ],
        };
        const ttl = records.length ? Math.min(3600, ...records.map((record) => record.TTL)) : 30;
        await cache.set(cacheKey, 'dns', result, ttl);
        return result;
      });
    },
    async ipInfo(input) {
      const { address } = ipInfoSchema.parse(input);
      const canonicalAddress =
        isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1) : address;
      const cacheKey = `rdap:${canonicalAddress}:1`;
      const cached = await cache.get<CalculationResult>(cacheKey);
      if (cached) return cacheMarked(cached);
      return bounded(async () => {
        const { base, publication } = await bootstrap(canonicalAddress);
        const query = new URL(
          `${base.toString().replace(/\/$/, '')}/ip/${encodeURIComponent(canonicalAddress)}`,
        );
        let response: { value: unknown; source: string; status: number };
        try {
          response = await transport.get(query);
        } catch (error) {
          if (
            !options.whoisFallback ||
            !(error instanceof AppError) ||
            !['LOOKUP_NOT_FOUND', 'UPSTREAM_UNAVAILABLE', 'LOOKUP_TIMEOUT'].includes(error.code)
          )
            throw error;
          const legacy = await safeWhois(canonicalAddress, base.hostname, options.timeoutMs);
          const retrievedAt = new Date().toISOString();
          const result: CalculationResult = {
            toolId: 'ip-info',
            title: `Registration information for ${canonicalAddress}`,
            normalizedInput: { address: canonicalAddress },
            engineVersion: 'lookup-1.0.0',
            summary: [
              { label: 'Address', value: canonicalAddress },
              { label: 'Source', value: legacy.source },
              { label: 'Retrieved', value: retrievedAt },
              { label: 'Cache', value: 'Fresh response' },
            ],
            steps: [
              {
                title: 'Legacy registry lookup',
                description:
                  'The approved regional registry was queried on TCP port 43 after RDAP was unavailable. Referrals in the response were not followed.',
              },
            ],
            rows: legacy.text
              .split(/\r?\n/)
              .filter(Boolean)
              .map((text, index) => ({ line: index + 1, text })),
            columns: [
              { key: 'line', label: 'Line' },
              { key: 'text', label: 'Registration text' },
            ],
            warnings: [
              'Legacy WHOIS transport is unencrypted. This record describes registered allocation, not the identity or location of an individual user.',
            ],
            data: { source: legacy.source, retrievedAt, cached: false, legacy: true },
            sources: ['https://www.rfc-editor.org/rfc/rfc3912'],
          };
          await cache.set(cacheKey, 'whois', result, 300);
          return result;
        }
        if (!response.value || typeof response.value !== 'object' || Array.isArray(response.value))
          throw new AppError(
            502,
            'UPSTREAM_FORMAT',
            'The registry response has an unexpected format.',
          );
        const data = response.value as Record<string, unknown>;
        const retrievedAt = new Date().toISOString();
        const rows: Record<string, CellValue>[] = [];
        if (Array.isArray(data.events))
          for (const event of data.events.slice(0, 50)) {
            if (event && typeof event === 'object')
              rows.push({
                field: plainString((event as Record<string, unknown>).eventAction),
                value: plainString((event as Record<string, unknown>).eventDate),
              });
          }
        const result: CalculationResult = {
          toolId: 'ip-info',
          title: `Registration information for ${canonicalAddress}`,
          normalizedInput: { address: canonicalAddress },
          engineVersion: 'lookup-1.0.0',
          summary: [
            { label: 'Address', value: canonicalAddress },
            { label: 'Registry name', value: plainString(data.name) },
            { label: 'Handle', value: plainString(data.handle) },
            { label: 'Start address', value: plainString(data.startAddress) },
            { label: 'End address', value: plainString(data.endAddress) },
            { label: 'Registration country', value: plainString(data.country) },
            { label: 'Address family', value: plainString(data.ipVersion) },
            { label: 'Registry', value: base.hostname },
            { label: 'Retrieved', value: retrievedAt },
            { label: 'Cache', value: 'Fresh response' },
          ],
          rows,
          columns: [
            { key: 'field', label: 'Event' },
            { key: 'value', label: 'Date' },
          ],
          steps: [
            {
              title: 'Registry selection',
              description: `IANA bootstrap data selected the longest matching address prefix. Bootstrap publication: ${publication}.`,
            },
            {
              title: 'Registration meaning',
              description:
                'RDAP describes a registered address allocation. Registration country is not an exact geolocation and the registrant is not necessarily the current end user.',
            },
            {
              title: 'Controlled retrieval',
              description:
                'Only approved HTTPS regional registries are queried. Referral links and addresses in the returned data are displayed without following them.',
            },
          ],
          warnings: [
            'Registration data does not identify the person currently using an IP address.',
          ],
          data: {
            source: response.source,
            retrievedAt,
            cached: false,
            raw: data,
            bootstrapPublication: publication,
          },
          sources: [response.source, 'https://www.rfc-editor.org/rfc/rfc9224'],
        };
        await cache.set(cacheKey, 'rdap', result, 3600);
        return result;
      });
    },
  };
}
