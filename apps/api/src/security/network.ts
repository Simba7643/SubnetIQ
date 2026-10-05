import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { connect, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { AppError } from '../middleware/errors.js';

export const approvedOrigins = new Set([
  'https://cloudflare-dns.com',
  'https://data.iana.org',
  'https://rdap.arin.net',
  'https://rdap.db.ripe.net',
  'https://rdap.apnic.net',
  'https://rdap.lacnic.net',
  'https://rdap.afrinic.net',
]);

export function ipNumber(address: string): { value: bigint; bits: number } {
  const family = isIP(address);
  if (family === 4)
    return {
      value: address.split('.').reduce((total, part) => (total << 8n) | BigInt(part), 0n),
      bits: 32,
    };
  if (family !== 6)
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter one valid IPv4 or IPv6 address.');
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const index = normalized.lastIndexOf(':');
    const ipv4 = ipNumber(normalized.slice(index + 1)).value;
    normalized = `${normalized.slice(0, index)}:${(ipv4 >> 16n).toString(16)}:${(ipv4 & 65535n).toString(16)}`;
  }
  const halves = normalized.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const parts =
    halves.length === 2
      ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
      : left;
  return {
    value: parts.reduce((total, part) => (total << 16n) | BigInt(`0x${part}`), 0n),
    bits: 128,
  };
}

export function addressInCidr(address: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split('/');
  if (!base || !prefixText || !/^\d+$/.test(prefixText)) return false;
  const ip = ipNumber(address);
  const network = ipNumber(base);
  const prefix = Number(prefixText);
  if (ip.bits !== network.bits || prefix < 0 || prefix > ip.bits) return false;
  const shift = BigInt(ip.bits - prefix);
  return ip.value >> shift === network.value >> shift;
}

export function isPublicDestination(address: string): boolean {
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    return ![
      '0.0.0.0/8',
      '10.0.0.0/8',
      '100.64.0.0/10',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '172.16.0.0/12',
      '192.0.0.0/24',
      '192.0.2.0/24',
      '192.168.0.0/16',
      '198.18.0.0/15',
      '198.51.100.0/24',
      '203.0.113.0/24',
      '224.0.0.0/4',
      '240.0.0.0/4',
    ].some((cidr) => addressInCidr(address, cidr));
  }
  if (family === 6) {
    return (
      addressInCidr(address, '2000::/3') &&
      !['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20'].some((cidr) =>
        addressInCidr(address, cidr),
      )
    );
  }
  return false;
}

export type AddressResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export async function resolvePublicAddress(
  hostname: string,
  resolver: AddressResolver = (name) => lookup(name, { all: true }),
): Promise<{ address: string; family: number }> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new AppError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The approved service name could not be resolved.',
    );
  }
  if (!addresses.length || addresses.some((item) => !isPublicDestination(item.address)))
    throw new AppError(
      502,
      'UNSAFE_UPSTREAM',
      'The approved service resolved to an address that is not permitted.',
    );
  return addresses.find((item) => item.family === 4) ?? addresses[0]!;
}

export interface JsonTransport {
  get(url: URL, accept?: string): Promise<{ value: unknown; source: string; status: number }>;
}

export class SafeJsonTransport implements JsonTransport {
  constructor(
    private readonly timeoutMs = 7000,
    private readonly maxBytes = 1048576,
    private readonly resolver?: AddressResolver,
  ) {}
  async get(
    url: URL,
    accept = 'application/rdap+json, application/json',
  ): Promise<{ value: unknown; source: string; status: number }> {
    if (
      url.protocol !== 'https:' ||
      !approvedOrigins.has(url.origin) ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new AppError(400, 'UNAPPROVED_UPSTREAM', 'This upstream service is not allowlisted.');
    const started = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const address = await Promise.race([
      resolvePublicAddress(url.hostname, this.resolver),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new AppError(504, 'LOOKUP_TIMEOUT', 'The lookup service did not resolve in time.'),
            ),
          this.timeoutMs,
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        const all = typeof options === 'object' && 'all' in options && options.all;
        if (all)
          (
            callback as unknown as (
              error: null,
              addresses: Array<{ address: string; family: number }>,
            ) => void
          )(null, [address]);
        else callback(null, address.address, address.family);
      };
      const request = httpsRequest(
        url,
        {
          method: 'GET',
          lookup: pinnedLookup,
          servername: url.hostname,
          agent: false,
          headers: { Accept: accept, 'Accept-Encoding': 'identity', 'User-Agent': 'SubnetIQ/1.0' },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          const status = response.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            response.resume();
            finish(
              new AppError(
                502,
                'UPSTREAM_REDIRECT',
                'The approved registry requested a redirect. Refresh the reviewed bootstrap source before following a new service.',
              ),
            );
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            finish(
              new AppError(
                status === 404 ? 404 : 502,
                status === 404 ? 'LOOKUP_NOT_FOUND' : 'UPSTREAM_UNAVAILABLE',
                status === 404
                  ? 'The registry has no record for this query.'
                  : 'The lookup service could not complete the request.',
              ),
            );
            return;
          }
          if (
            response.headers['content-encoding'] &&
            response.headers['content-encoding'] !== 'identity'
          ) {
            response.destroy();
            finish(
              new AppError(
                502,
                'UPSTREAM_FORMAT',
                'The lookup returned an unsupported encoded response.',
              ),
            );
            return;
          }
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > this.maxBytes) {
              response.destroy();
              finish(
                new AppError(
                  502,
                  'UPSTREAM_TOO_LARGE',
                  'The lookup response exceeded the permitted size.',
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            try {
              finish(undefined, {
                value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
                source: url.toString(),
                status,
              });
            } catch {
              finish(
                new AppError(502, 'UPSTREAM_FORMAT', 'The lookup service returned invalid JSON.'),
              );
            }
          });
          response.on('error', () =>
            finish(
              new AppError(
                502,
                'UPSTREAM_UNAVAILABLE',
                'The lookup connection ended unexpectedly.',
              ),
            ),
          );
        },
      );
      const deadline = setTimeout(
        () => {
          request.destroy();
          finish(
            new AppError(504, 'LOOKUP_TIMEOUT', 'The lookup service did not respond in time.'),
          );
        },
        Math.max(1, this.timeoutMs - (Date.now() - started)),
      );
      function finish(error?: Error, value?: { value: unknown; source: string; status: number }) {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (error) reject(error);
        else if (value) resolve(value);
      }
      request.on('error', () =>
        finish(
          new AppError(
            502,
            'UPSTREAM_UNAVAILABLE',
            'The approved lookup service could not be reached.',
          ),
        ),
      );
      request.end();
    });
  }
}

const whoisHosts: Record<string, string> = {
  'rdap.arin.net': 'whois.arin.net',
  'rdap.db.ripe.net': 'whois.ripe.net',
  'rdap.apnic.net': 'whois.apnic.net',
  'rdap.lacnic.net': 'whois.lacnic.net',
  'rdap.afrinic.net': 'whois.afrinic.net',
};

export async function safeWhois(
  address: string,
  registryHost: string,
  timeoutMs = 5000,
): Promise<{ text: string; source: string }> {
  if (!isIP(address) || address.includes('%'))
    throw new AppError(400, 'VALIDATION_ERROR', 'WHOIS accepts an individual IP address.');
  const hostname = whoisHosts[registryHost];
  if (!hostname)
    throw new AppError(400, 'UNAPPROVED_UPSTREAM', 'This WHOIS service is not allowlisted.');
  const started = Date.now();
  let resolutionTimer: ReturnType<typeof setTimeout> | undefined;
  const destination = await Promise.race([
    resolvePublicAddress(hostname),
    new Promise<never>((_resolve, reject) => {
      resolutionTimer = setTimeout(
        () =>
          reject(new AppError(504, 'LOOKUP_TIMEOUT', 'The WHOIS service did not resolve in time.')),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (resolutionTimer) clearTimeout(resolutionTimer);
  });
  return new Promise((resolve, reject) => {
    let result = '';
    const socket = connect({ host: destination.address, port: 43, family: destination.family });
    const timeout = setTimeout(
      () => {
        socket.destroy();
        reject(new AppError(504, 'LOOKUP_TIMEOUT', 'The WHOIS service timed out.'));
      },
      Math.max(1, timeoutMs - (Date.now() - started)),
    );
    socket.once('connect', () =>
      socket.write(`${hostname === 'whois.arin.net' ? 'n + ' : ''}${address}\r\n`),
    );
    socket.on('data', (chunk: Buffer) => {
      result += chunk.toString('utf8');
      if (Buffer.byteLength(result) > 131072) {
        socket.destroy();
        reject(
          new AppError(
            502,
            'UPSTREAM_TOO_LARGE',
            'The WHOIS response exceeded the permitted size.',
          ),
        );
      }
    });
    socket.once('end', () => {
      clearTimeout(timeout);
      resolve({ text: result, source: `whois://${hostname}:43` });
    });
    socket.once('error', () => {
      clearTimeout(timeout);
      reject(new AppError(502, 'UPSTREAM_UNAVAILABLE', 'The WHOIS service could not be reached.'));
    });
    socket.once('close', () => clearTimeout(timeout));
  });
}
