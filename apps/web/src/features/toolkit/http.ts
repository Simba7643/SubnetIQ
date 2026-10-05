import { toolkitResult } from './results';

export const headerReference: Record<string, { meaning: string; source: string }> = {
  'content-type': {
    meaning: 'Declares the representation media type, optionally including a character encoding.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-content-type',
  },
  'content-length': {
    meaning:
      'States a decimal number of octets. Interpretation also depends on the method and status.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-content-length',
  },
  'cache-control': {
    meaning:
      'Controls caching. no-store prevents storage; no-cache requires successful validation before reuse.',
    source: 'https://www.rfc-editor.org/rfc/rfc9111.html#name-cache-control',
  },
  etag: {
    meaning:
      'A representation validator used with conditional requests; it need not be a content hash.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-etag',
  },
  vary: {
    meaning: 'Identifies request fields used to select a response for caching.',
    source: 'https://www.rfc-editor.org/rfc/rfc9111.html#name-calculating-cache-keys-with-',
  },
  location: {
    meaning: 'Identifies a resource or redirect target. The status code determines its meaning.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-location',
  },
  server: {
    meaning:
      'Advertises server software. The value can be changed and is not trustworthy identification.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-server',
  },
  host: {
    meaning: 'Specifies the target host and optional port in HTTP/1.1.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-host-and-authority',
  },
  authorization: {
    meaning: 'Contains authentication credentials. Its value is redacted from this report.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-authorization',
  },
  'www-authenticate': {
    meaning: 'Advertises authentication challenges applicable to the requested resource.',
    source: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-www-authenticate',
  },
  'strict-transport-security': {
    meaning:
      'An HTTPS response can instruct browsers to require HTTPS for later requests. max-age=0 removes the stored policy.',
    source: 'https://www.rfc-editor.org/rfc/rfc6797.html',
  },
  'content-security-policy': {
    meaning:
      'Restricts resource loading and selected browser behavior. Effective protection depends on the complete policy and application.',
    source: 'https://www.w3.org/TR/CSP3/',
  },
  'content-security-policy-report-only': {
    meaning: 'Reports policy violations without enforcing those restrictions.',
    source: 'https://www.w3.org/TR/CSP3/',
  },
  'x-content-type-options': {
    meaning: 'The nosniff value restricts MIME type guessing for specific resource requests.',
    source: 'https://fetch.spec.whatwg.org/#x-content-type-options-header',
  },
  'referrer-policy': {
    meaning: 'Controls which referrer information a browser sends when making requests.',
    source: 'https://www.w3.org/TR/referrer-policy/',
  },
  'permissions-policy': {
    meaning: 'Limits availability of specified browser features to documents and embedded origins.',
    source: 'https://www.w3.org/TR/permissions-policy-1/',
  },
  'access-control-allow-origin': {
    meaning:
      'Declares an origin allowed to read a cross-origin response. CORS does not provide authentication.',
    source: 'https://fetch.spec.whatwg.org/#http-cors-protocol',
  },
  'access-control-allow-credentials': {
    meaning:
      'The value true allows an explicitly authorized origin to receive a credentialed response.',
    source: 'https://fetch.spec.whatwg.org/#http-cors-protocol',
  },
  cookie: {
    meaning: 'Carries stored cookie values to the server. Values are redacted from this report.',
    source: 'https://www.rfc-editor.org/rfc/rfc6265.html',
  },
  'set-cookie': {
    meaning: 'Sets a cookie and its attributes. Values are redacted from this report.',
    source: 'https://www.rfc-editor.org/rfc/rfc6265.html',
  },
};

export function interpretHeaders(raw: string) {
  if (raw.length > 32000) throw new Error('Paste at most 32,000 characters of headers.');
  if (!raw.trim()) throw new Error('Paste an HTTP start line or one or more header lines.');
  const lines = raw.split(/\r?\n/);
  const rows: { name: string; value: string; meaning: string }[] = [];
  const warnings: string[] = [];
  const sources = new Set<string>();
  let startLine = 'Not provided';
  let headerSectionEnded = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      if (rows.length > 0 || startLine !== 'Not provided') headerSectionEnded = true;
      continue;
    }
    if (headerSectionEnded) {
      warnings.push('Content after the first blank line was excluded as a possible message body.');
      break;
    }
    const hasControl = [...line].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9) || code === 127;
    });
    if (hasControl)
      throw new Error('Line ' + (index + 1) + ' contains an invalid HTTP control character.');
    if (
      rows.length === 0 &&
      startLine === 'Not provided' &&
      (/^HTTP\/[0-9.]+\s+\d{3}(?:\s|$)/.test(line) || /^[A-Z]+\s+\S+\s+HTTP\/[0-9.]+$/.test(line))
    ) {
      startLine = line.replace(/\?\S*(?=\s+HTTP\/)/, '?[query redacted]').slice(0, 300);
      continue;
    }
    const match = /^([!#$%&'*+.^_`|~A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line);
    if (!match)
      throw new Error(
        'Line ' + (index + 1) + ' is not a valid single-line HTTP header. Use Name: value.',
      );
    const name = match[1].toLowerCase();
    const value = match[2];
    const sensitive = /authorization|cookie|token|secret|api[-_]?key/.test(name);
    const reference = Object.hasOwn(headerReference, name) ? headerReference[name] : undefined;
    if (reference) sources.add(reference.source);
    rows.push({
      name,
      value: sensitive ? '[redacted sensitive value]' : value,
      meaning:
        reference?.meaning ??
        'An extension or unrecognized header; consult the service documentation for its semantics.',
    });
    if (name === 'set-cookie') {
      const attributes = value
        .split(';')
        .slice(1)
        .map((item) => item.trim().split('=')[0].toLowerCase());
      if (!attributes.includes('secure'))
        warnings.push('A Set-Cookie line has no Secure attribute.');
      if (!attributes.includes('httponly'))
        warnings.push(
          'A Set-Cookie line has no HttpOnly attribute; JavaScript may need access, depending on its purpose.',
        );
    }
    if (name === 'content-length' && !/^\d+$/.test(value))
      warnings.push('Content-Length should contain a nonnegative decimal integer.');
    if (rows.length > 200) throw new Error('Paste no more than 200 header lines.');
  }
  const duplicateLengths = rows.filter((row) => row.name === 'content-length');
  if (duplicateLengths.length > 1)
    warnings.push('Repeated Content-Length fields need careful message-framing validation.');
  if (rows.some((row) => row.name === 'transfer-encoding') && duplicateLengths.length)
    warnings.push(
      'Both Transfer-Encoding and Content-Length are present. Review HTTP/1.1 framing before forwarding this message.',
    );
  if (
    rows.some((row) => row.name === 'access-control-allow-origin' && row.value === '*') &&
    rows.some((row) => row.name === 'access-control-allow-credentials' && row.value === 'true')
  )
    warnings.push(
      'Wildcard Access-Control-Allow-Origin cannot authorize a credentialed browser response.',
    );
  return toolkitResult(
    'http-headers',
    'HTTP header interpretation',
    { headerCount: rows.length },
    [
      { label: 'Start line', value: startLine },
      { label: 'Header lines', value: rows.length },
      { label: 'Processing', value: 'Local to this browser' },
      { label: 'Sensitive fields', value: 'Known credential and cookie values redacted' },
    ],
    {
      rows,
      columns: [
        { key: 'name', label: 'Header' },
        { key: 'value', label: 'Value' },
        { key: 'meaning', label: 'Meaning' },
      ],
      warnings: [...new Set(warnings)],
      sources: [...sources],
      steps: [
        {
          title: 'Parse field lines',
          description:
            'Header names are case insensitive. Repeated fields remain separate so their original structure is visible.',
        },
        {
          title: 'Read values in context',
          description:
            'A pasted header block does not verify a server, TLS session, message body, or effective application security.',
        },
        {
          title: 'Protect pasted credentials',
          description:
            'The report omits the original input. Recognized credential, cookie, token, and secret fields are redacted before copy, sharing, exports, or AI attachments.',
        },
      ],
    },
  );
}

export const tlsSteps = [
  {
    title: 'ClientHello',
    description:
      'The client offers supported parameters and a key share, and may include the target server name and application protocol preferences.',
  },
  {
    title: 'ServerHello',
    description:
      'The server selects compatible parameters and a key share. Both endpoints derive handshake traffic keys.',
  },
  {
    title: 'Server authentication',
    description:
      'In a certificate-based handshake, the server sends its certificate, proves possession of the signing key, and authenticates the handshake transcript.',
  },
  {
    title: 'Client verification',
    description:
      'The client checks certificate trust and the expected service identity, then verifies the server proof and Finished message.',
  },
  {
    title: 'Protected application data',
    description:
      'Traffic keys protect records with authenticated encryption. The client sends its Finished message; optional client authentication adds a client certificate exchange.',
  },
];
