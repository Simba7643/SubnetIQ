import { readFile, readdir, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { isIP } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const words = (value) => String(value).trim().split(/\s+/).filter(Boolean).length;
const slug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const unique = (items) => new Set(items).size === items.length;
const validDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().startsWith(value);
const sourceUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
const datasets = {};
for (const file of (await readdir(join(root, 'data')))
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  try {
    const data = JSON.parse(await readFile(join(root, 'data', file), 'utf8'));
    assert(Array.isArray(data), `data/${file}: expected a JSON array.`);
    if (!Array.isArray(data)) continue;
    datasets[file.replace(/\.json$/, '')] = data.filter(
      (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
    );
    assert(data.length > 0, `data/${file}: dataset is empty.`);
    assert(
      data.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)),
      `data/${file}: every entry must be an object.`,
    );
    const ids = data.filter((entry) => entry?.id !== undefined).map((entry) => entry.id);
    assert(ids.every(slug) && unique(ids), `data/${file}: IDs must be unique lowercase slugs.`);
    if (!['oui-subset.json', 'special-ipv4.json', 'special-ipv6.json'].includes(file))
      assert(ids.length === data.length, `data/${file}: every entry requires an ID.`);
  } catch (error) {
    errors.push(`data/${file}: ${error.message}`);
  }
}
const requiredData = [
  'articles',
  'cloud-profiles',
  'commands',
  'courses',
  'cvss',
  'glossary',
  'network-templates',
  'oui-subset',
  'ports',
  'protocols',
  'quiz-bank',
  'rfc-index',
  'sources',
  'special-ipv4',
  'special-ipv6',
  'threats',
];
for (const key of requiredData)
  assert(Array.isArray(datasets[key]), `Missing required dataset: data/${key}.json`);
const get = (key) => datasets[key] || [];
function requireText(entry, fields, label) {
  for (const field of fields)
    assert(text(entry[field]), `${label}: ${field} must be nonempty text.`);
}
function requireSource(entry, field, label) {
  assert(sourceUrl(entry[field]), `${label}: ${field} must be an absolute HTTPS source URL.`);
}
function v4(value) {
  if (isIP(value) !== 4) throw new Error(`Invalid IPv4 address ${value}`);
  return value.split('.').reduce((total, octet) => total * 256 + Number(octet), 0);
}
function dotted(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}
function ipv6Integer(value) {
  if (isIP(value) !== 6 || value.includes('%')) throw new Error(`Invalid IPv6 address ${value}`);
  let input = value.toLowerCase();
  if (input.includes('.')) {
    const index = input.lastIndexOf(':');
    const number = v4(input.slice(index + 1));
    input =
      input.slice(0, index + 1) +
      Math.floor(number / 65536).toString(16) +
      ':' +
      (number % 65536).toString(16);
  }
  const [left = '', right] = input.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const groups =
    right === undefined
      ? first
      : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return groups.reduce((total, group) => total * 65536n + BigInt(`0x${group}`), 0n);
}
function subnet(value, family) {
  const match = /^([^/]+)\/(0|[1-9]\d{0,2})$/.exec(String(value));
  if (!match || isIP(match[1]) !== family) throw new Error(`Invalid IPv${family} CIDR ${value}`);
  const bits = family === 4 ? 32 : 128;
  const prefix = Number(match[2]);
  if (prefix > bits) throw new Error(`Prefix outside IPv${family} range: ${value}`);
  const address = family === 4 ? BigInt(v4(match[1])) : ipv6Integer(match[1]);
  const size = 2n ** BigInt(bits - prefix);
  const start = (address / size) * size;
  return { address, start, end: start + size - 1n, size, prefix, family };
}
function checkAction(label, action) {
  try {
    action();
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
  }
}

const glossary = get('glossary');
assert(
  glossary.length >= 220,
  `Glossary has ${glossary.length} entries; the accepted scope requires at least 220.`,
);
const glossaryIds = new Set(glossary.map((entry) => entry.id));
assert(
  unique(glossary.map((entry) => String(entry.term).toLowerCase())),
  'Glossary terms must be unique without regard to case.',
);
for (const entry of glossary) {
  requireText(entry, ['id', 'term', 'category', 'definition', 'example'], `Glossary ${entry.id}`);
  assert(
    words(entry.definition) >= 4 && words(entry.example) >= 3,
    `Glossary ${entry.id}: provide a substantive definition and example.`,
  );
  assert(
    Array.isArray(entry.related) && entry.related.length > 0 && unique(entry.related),
    `Glossary ${entry.id}: related terms must be a nonempty unique array.`,
  );
  for (const id of Array.isArray(entry.related) ? entry.related : [])
    assert(
      glossaryIds.has(id) && id !== entry.id,
      `Glossary ${entry.id}: related term ${id} is missing or self-referential.`,
    );
}
const categories = new Set(glossary.map((entry) => String(entry.category).toLowerCase()));
for (const category of ['addressing', 'routing', 'switching', 'security', 'protocols'])
  assert(categories.has(category), `Glossary is missing required category ${category}.`);

const courseIds = [
  'ip-basics',
  'binary-math',
  'address-classes',
  'cidr',
  'subnetting',
  'vlsm',
  'summarization',
  'ipv6',
  'nat',
  'dhcp',
  'dns',
  'routing',
];
const courses = get('courses');
assert(courses.length >= 12, 'The learning path must include at least twelve complete lessons.');
for (const id of courseIds)
  assert(
    courses.some((course) => course.id === id),
    `Missing required course ${id}.`,
  );
let courseWordCount = 0;
for (const course of courses) {
  requireText(course, ['id', 'title', 'description', 'category', 'content'], `Course ${course.id}`);
  assert(
    Number.isInteger(course.readingMinutes) && course.readingMinutes > 0,
    `Course ${course.id}: readingMinutes must be positive.`,
  );
  assert(
    Array.isArray(course.objectives) &&
      course.objectives.length >= 2 &&
      course.objectives.every(text),
    `Course ${course.id}: provide at least two learning objectives.`,
  );
  const wordCount = words(course.content);
  courseWordCount += wordCount;
  assert(
    wordCount >= 300,
    `Course ${course.id}: ${wordCount} words is below the completeness check of 300.`,
  );
  assert(
    (String(course.content).match(/^## /gm) || []).length >= 3,
    `Course ${course.id}: expected structured lesson sections.`,
  );
  assert(
    /https:\/\/(?:www\.)?(?:rfc-editor\.org|iana\.org|datatracker\.ietf\.org|[a-z.]*cisco\.com)/.test(
      course.content,
    ),
    `Course ${course.id}: no primary networking reference found.`,
  );
  checkAction(`Course ${course.id}`, () =>
    assert(
      !/\]\(\s*(?:javascript|data|file):/i.test(course.content),
      `Course ${course.id}: unsafe markdown link scheme.`,
    ),
  );
  try {
    const file = await readFile(join(root, 'content/courses', `${course.id}.md`), 'utf8');
    assert(
      file.includes(course.title) &&
        file
          .replace(/^\s*\|[\s:|-]+$/gm, '')
          .replace(/\s+/g, ' ')
          .includes(
            String(course.content)
              .replace(/^\s*\|[\s:|-]+$/gm, '')
              .replace(/\s+/g, ' ')
              .trim(),
          ),
      `Course ${course.id}: markdown source and JSON content are out of sync.`,
    );
  } catch {
    errors.push(`Course ${course.id}: missing content/courses/${course.id}.md.`);
  }
}
assert(
  courseWordCount >= 5000,
  `The complete course collection has ${courseWordCount} words; expected at least 5000 substantive lesson words.`,
);

const facts = new Map([
  ['What is the largest unsigned decimal value in one octet?', '255'],
  ['How many bits does one hexadecimal digit represent?', '4'],
  [
    'When an IPv4 prefix increases from /24 to /25, what happens to total addresses per subnet?',
    'They halve',
  ],
  ['Which address is the first conventional usable host of 192.0.2.64/27?', '192.0.2.65'],
  [
    'How many endpoint addresses does an IPv4 /31 provide under RFC 3021 point-to-point rules?',
    '2',
  ],
  ['How many addresses are in an IPv4 /32?', '1'],
  ['How many total addresses are represented by IPv4 0.0.0.0/0?', '4,294,967,296'],
  ['Which address belongs to RFC 1918 private space?', '172.31.4.9'],
  ['What is the IPv4 loopback range?', '127.0.0.0/8'],
  ['Which block is RFC 6598 shared address space?', '100.64.0.0/10'],
  [
    'Which statement about an address outside RFC 1918 is correct?',
    'It may still be reserved or not globally reachable',
  ],
  [
    'What is a sensible first step in unconstrained VLSM allocation?',
    'Sort requirements by descending required block size',
  ],
  ['A VLAN needs 60 endpoints plus one gateway. Which smallest conventional subnet fits?', '/26'],
  [
    'A VLAN has 80 required addresses including its gateway and needs 25% growth. Which smallest conventional subnet fits?',
    '/25',
  ],
  [
    'Two private blocks overlap in different isolated VRFs. What follows?',
    'Reuse may be intentional within separate routing contexts',
  ],
  ['Which pair can merge into one exact /24?', '192.0.2.0/25 and 192.0.2.128/25'],
  [
    'A covering summary includes unallocated addresses. What should a planner show?',
    'The extra included address space explicitly',
  ],
  [
    'Which route wins for 10.1.2.9 when /8, /16, and matching /24 routes exist?',
    'The matching /24',
  ],
  ['Which IPv6 route is the default route?', '::/0'],
  [
    'For an off-link IPv4 destination, which MAC address does a host normally resolve?',
    'The next-hop router MAC on its local link',
  ],
  [
    'Why can a route summary need a discard route for unused space?',
    'To avoid loops toward broader fallback routes',
  ],
  ['How many bits are in an IPv6 address?', '128'],
  ['Which is the compressed form of 2001:0db8:0000:0000:0000:0000:0000:0001?', '2001:db8::1'],
  ['How many times can :: appear in one valid IPv6 address?', 'At most once'],
  ['Which address type is absent from IPv6?', 'Broadcast'],
  ['Which IPv6 range contains link-local addresses?', 'fe80::/10'],
  ['What does the %eth0 suffix in fe80::1%eth0 identify?', 'The local scope zone or interface'],
  [
    'Which prefix is specifically described for IPv6 inter-router point-to-point links by RFC 6164?',
    '/127',
  ],
  [
    'Which statement about modified EUI-64 is correct?',
    'It inserts FFFE and flips the universal/local bit',
  ],
  ['How many /64 networks does an IPv6 /48 contain?', '65,536'],
  [
    'What is ::ffff:192.0.2.10 commonly used to represent?',
    'An IPv4 endpoint in an IPv6-capable API',
  ],
  ['Which DNS type stores an IPv6 address?', 'AAAA'],
  ['What does a lower MX preference number mean?', 'The exchanger is preferred over higher values'],
  ['Which name is the host reverse lookup for 192.0.2.10?', '10.2.0.192.in-addr.arpa'],
  ['What does DNSSEC provide?', 'DNS data-origin authentication and integrity'],
  [
    'An existing name has no AAAA record. Which result is possible?',
    'Successful response with an empty answer',
  ],
  ['What is the normal initial DHCPv4 message sequence?', 'Discover, Offer, Request, Acknowledge'],
  ['What connects DHCP clients to a server on another routed subnet?', 'A DHCP relay'],
  ['How does an IPv6 host normally learn its default router?', 'Router Advertisements'],
  [
    'Does NAT by itself define a complete security policy?',
    'No; translation and access control are distinct',
  ],
  [
    'What is the meaning of a zero bit in a Cisco-style wildcard mask?',
    'Compare the corresponding address bit',
  ],
  ['Which wildcard corresponds to IPv4 /27?', '0.0.0.31'],
  [
    'Why must a lookup API avoid arbitrary user-selected upstream URLs?',
    'They can enable server-side request forgery',
  ],
  [
    'Which check prevents one user reading another user’s project by changing its ID?',
    'Resource-specific authorization',
  ],
  [
    'What does a CVSS score primarily express?',
    'Technical vulnerability severity under stated metrics',
  ],
  [
    'With MTU 1500, minimum IPv4 header 20, and minimum TCP header 20, what is the TCP payload limit?',
    '1460 bytes',
  ],
  [
    'At an ideal 100 Mb/s with no overhead, how long does 100 MB take using decimal units?',
    '8 seconds',
  ],
  ['Which transport underlies HTTP/3?', 'QUIC over UDP'],
  ['What commonly defines a separate Ethernet broadcast domain?', 'A VLAN'],
  [
    'What is the purpose of spanning tree?',
    'Prevent forwarding loops while retaining redundant links',
  ],
  [
    'What does the local-administration bit imply for MAC vendor lookup?',
    'The prefix is not authoritative evidence of a vendor',
  ],
  [
    'A router has 10.0.0.0/8 and 10.2.0.0/16. Which route matches 10.2.4.5 most specifically?',
    '10.2.0.0/16',
  ],
  ['What is the total number of addresses in an IPv6 /128?', '1'],
  ['Which range exactly describes 192.0.2.128/26?', '192.0.2.128–192.0.2.191'],
  [
    'Can generating a host PTR name establish authority to delegate the corresponding reverse zone?',
    'No; delegation requires the address holder’s DNS arrangements',
  ],
  [
    'Can a /24 be exactly divided into three equal CIDR children with no space left over?',
    'No; an equal complete partition has a power-of-two count',
  ],
]);
function expectedAnswer(question) {
  let match = /^Which network contains ([\d.]+)\/(\d+)\?$/.exec(question);
  if (match) {
    const size = 2 ** (32 - Number(match[2]));
    return dotted(Math.floor(v4(match[1]) / size) * size);
  }
  match = /^What is the conventional IPv4 broadcast address for ([\d.]+)\/(\d+)\?$/.exec(question);
  if (match) {
    const size = 2 ** (32 - Number(match[2]));
    return dotted(Math.floor(v4(match[1]) / size) * size + size - 1);
  }
  match =
    /^With ordinary IPv4 LAN reservations only, how many usable addresses does a \/(\d+) subnet provide\?$/.exec(
      question,
    );
  if (match) return String(2 ** (32 - Number(match[1])) - 2);
  match = /^Which dotted-decimal subnet mask represents \/(\d+)\?$/.exec(question);
  if (match) return dotted(2 ** 32 - 2 ** (32 - Number(match[1])));
  match =
    /^A department needs (\d+) IPv4 addresses including its gateway\. With conventional LAN rules and no growth margin, what is its smallest fitting prefix\?$/.exec(
      question,
    );
  if (match) return `/${32 - Math.ceil(Math.log2(Number(match[1]) + 2))}`;
  match =
    /^Which CIDR exactly aggregates ([\d.]+\/\d+) and ([\d.]+\/\d+) without adding addresses\?$/.exec(
      question,
    );
  if (match) {
    const first = subnet(match[1], 4);
    const second = subnet(match[2], 4);
    if (
      first.prefix !== second.prefix ||
      first.end + 1n !== second.start ||
      first.start % (first.size * 2n) !== 0n
    )
      throw new Error(
        'Question names networks that cannot form its claimed exact one-prefix aggregate.',
      );
    return `${dotted(Number(first.start))}/${first.prefix - 1}`;
  }
  match = /^How many aligned \/(\d+) IPv6 child networks exactly partition one \/(\d+)\?$/.exec(
    question,
  );
  if (match) return (2n ** BigInt(Number(match[1]) - Number(match[2]))).toString();
  match = /^What decimal value does binary ([01]+) represent\?$/.exec(question);
  if (match) return String(Number.parseInt(match[1], 2));
  return facts.get(question);
}
const questions = get('quiz-bank');
assert(
  questions.length >= 160,
  `Quiz bank has ${questions.length} questions; expected at least 160.`,
);
assert(
  unique(questions.map((entry) => entry.question)),
  'Quiz bank contains duplicate question text.',
);
const levels = ['beginner', 'intermediate', 'advanced', 'exam'];
let checkedAnswers = 0;
for (const question of questions) {
  requireText(
    question,
    ['id', 'topic', 'difficulty', 'question', 'explanation'],
    `Question ${question.id}`,
  );
  assert(levels.includes(question.difficulty), `Question ${question.id}: invalid difficulty.`);
  assert(
    Array.isArray(question.options) &&
      question.options.length === 4 &&
      question.options.every(text) &&
      unique(question.options),
    `Question ${question.id}: exactly four distinct nonempty choices are required.`,
  );
  assert(
    Number.isInteger(question.correctIndex) &&
      question.correctIndex >= 0 &&
      question.correctIndex < question.options?.length,
    `Question ${question.id}: correctIndex is outside the choice list.`,
  );
  assert(
    words(question.explanation) >= 10,
    `Question ${question.id}: explanation is too short to justify the answer.`,
  );
  checkAction(`Question ${question.id}`, () => {
    const expected = expectedAnswer(question.question);
    assert(
      expected !== undefined,
      `Question ${question.id}: add an independent arithmetic or reviewed factual correctness criterion before accepting this question.`,
    );
    if (expected !== undefined) {
      const normalize = (value) => String(value).replaceAll(',', '').trim();
      assert(
        normalize(question.options[question.correctIndex]) === normalize(expected),
        `Question ${question.id}: marked answer "${question.options[question.correctIndex]}" does not match independently checked answer "${expected}".`,
      );
      checkedAnswers += 1;
    }
  });
}
for (const level of levels)
  assert(
    questions.some((entry) => entry.difficulty === level),
    `Quiz bank has no ${level} questions.`,
  );

const articles = get('articles');
assert(articles.length >= 5, 'At least five complete sample articles are required.');
for (const article of articles) {
  requireText(
    article,
    ['id', 'title', 'description', 'category', 'publishedAt', 'file'],
    `Article ${article.id}`,
  );
  assert(validDate(article.publishedAt), `Article ${article.id}: invalid publication date.`);
  assert(
    Number.isInteger(article.readingMinutes) && article.readingMinutes > 0,
    `Article ${article.id}: readingMinutes must be positive.`,
  );
  assert(
    article.file === `${article.id}.md`,
    `Article ${article.id}: file name must match its ID.`,
  );
  try {
    const source = await readFile(join(root, 'content/blog', article.file), 'utf8');
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert(words(body) >= 600, `Article ${article.id}: expected at least 600 substantive words.`);
    assert(
      source.includes(`id: ${article.id}`),
      `Article ${article.id}: source frontmatter ID disagrees with the metadata catalog.`,
    );
    assert(
      (body.match(/^## /gm) || []).length >= 3,
      `Article ${article.id}: expected structured sections.`,
    );
    assert(
      /https:\/\/(?:www\.)?(?:rfc-editor\.org|iana\.org|datatracker\.ietf\.org|[a-z.]*cisco\.com)/.test(
        body,
      ),
      `Article ${article.id}: no primary networking reference found.`,
    );
    assert(
      !/\]\(\s*(?:javascript|data|file):/i.test(body),
      `Article ${article.id}: unsafe markdown link scheme.`,
    );
  } catch {
    errors.push(`Article ${article.id}: missing content/blog/${article.file}.`);
  }
}
for (const port of get('ports')) {
  requireText(port, ['id', 'transport', 'service', 'description', 'security'], `Port ${port.id}`);
  assert(
    Number.isInteger(port.port) && port.port >= 0 && port.port <= 65535,
    `Port ${port.id}: port number must be 0–65535.`,
  );
  assert(
    ['TCP', 'UDP', 'TCP/UDP', 'SCTP', 'DCCP'].includes(port.transport),
    `Port ${port.id}: unsupported transport label.`,
  );
  requireSource(port, 'source', `Port ${port.id}`);
}
assert(
  get('ports').length >= 20 &&
    get('ports').some((entry) => entry.port < 1024) &&
    get('ports').some((entry) => entry.port >= 1024 && entry.port <= 49151),
  'Port reference must cover a substantive selection of well-known and registered ports.',
);
for (const protocol of get('protocols')) {
  requireText(protocol, ['id', 'name', 'layer', 'description', 'uses'], `Protocol ${protocol.id}`);
  requireSource(protocol, 'source', `Protocol ${protocol.id}`);
}
assert(get('protocols').length >= 10, 'Protocol reference must contain at least ten entries.');
assert(unique(get('oui-subset').map((entry) => entry.prefix)), 'OUI prefixes must be unique.');
for (const entry of get('oui-subset')) {
  assert(
    /^(?:[\dA-F]{2}:){2}[\dA-F]{2}$/.test(entry.prefix),
    `OUI ${entry.prefix}: expected uppercase 24-bit prefix.`,
  );
  requireText(entry, ['vendor'], `OUI ${entry.prefix}`);
  requireSource(entry, 'source', `OUI ${entry.prefix}`);
}
for (const entry of get('rfc-index')) {
  assert(
    Number.isInteger(entry.number) && entry.number > 0,
    `RFC ${entry.id}: invalid RFC number.`,
  );
  requireText(entry, ['title', 'description'], `RFC ${entry.id}`);
  requireSource(entry, 'url', `RFC ${entry.id}`);
}
for (const entry of get('sources')) {
  requireText(entry, ['title', 'license', 'scope'], `Source ${entry.id}`);
  if (!(entry.id === 'original-learning' && entry.url === '' && entry.scope.startsWith('Original')))
    requireSource(entry, 'url', `Source ${entry.id}`);
  assert(validDate(entry.retrievedAt), `Source ${entry.id}: invalid retrieval date.`);
}
for (const entry of get('threats')) {
  requireText(entry, ['name', 'description'], `Threat ${entry.id}`);
  assert(
    Array.isArray(entry.indicators) && entry.indicators.length >= 2 && entry.indicators.every(text),
    `Threat ${entry.id}: provide at least two indicators.`,
  );
  assert(
    Array.isArray(entry.defenses) && entry.defenses.length >= 2 && entry.defenses.every(text),
    `Threat ${entry.id}: provide at least two defenses.`,
  );
  requireSource(entry, 'source', `Threat ${entry.id}`);
}
for (const entry of get('commands')) {
  requireText(
    entry,
    ['name', 'platform', 'purpose', 'syntax', 'example', 'caution'],
    `Command ${entry.id}`,
  );
  requireSource(entry, 'source', `Command ${entry.id}`);
}
for (const name of [
  'ping',
  'tracert',
  'nmap',
  'netstat',
  'ip',
  'ifconfig',
  'dig',
  'nslookup',
  'tcpdump',
])
  assert(
    get('commands').some((entry) => entry.name.toLowerCase().includes(name)),
    `Missing required command reference ${name}.`,
  );
for (const entry of get('cvss')) {
  requireText(entry, ['title', 'description', 'example'], `CVSS card ${entry.id}`);
  requireSource(entry, 'source', `CVSS card ${entry.id}`);
}
for (const family of [4, 6]) {
  const entries = get(`special-ipv${family}`);
  const normalized = [];
  for (const entry of entries)
    checkAction(`IPv${family} registry ${entry.cidr}`, () => {
      const network = subnet(entry.cidr, family);
      assert(
        network.address === network.start,
        `IPv${family} registry ${entry.cidr}: CIDR is not aligned.`,
      );
      normalized.push(`${network.start}/${network.prefix}`);
      assert(entry.family === family, `IPv${family} registry ${entry.cidr}: family mismatch.`);
      for (const flag of [
        'source',
        'destination',
        'forwardable',
        'globallyReachable',
        'reservedByProtocol',
      ])
        assert(
          entry[flag] === null || typeof entry[flag] === 'boolean',
          `Registry ${entry.cidr}: ${flag} must be boolean or null.`,
        );
      requireText(entry, ['name', 'category', 'reference', 'notes'], `Registry ${entry.cidr}`);
      requireSource(entry, 'sourceUrl', `Registry ${entry.cidr}`);
      assert(
        validDate(entry.registryVersion) && validDate(entry.reviewedAt),
        `Registry ${entry.cidr}: missing version/review date.`,
      );
    });
  assert(unique(normalized), `IPv${family} registry contains duplicate canonical prefixes.`);
}
for (const entry of get('cloud-profiles')) {
  assert(['aws', 'azure', 'gcp'].includes(entry.id), `Unknown cloud profile ${entry.id}.`);
  requireText(entry, ['name', 'scope', 'exceptions'], `Cloud ${entry.id}`);
  assert(
    Number.isInteger(entry.minPrefix) &&
      Number.isInteger(entry.maxPrefix) &&
      entry.minPrefix >= 0 &&
      entry.maxPrefix <= 32 &&
      entry.minPrefix <= entry.maxPrefix,
    `Cloud ${entry.id}: invalid prefix bounds.`,
  );
  for (const field of ['firstReserved', 'lastReserved', 'reserved'])
    assert(
      Number.isInteger(entry[field]) && entry[field] >= 0,
      `Cloud ${entry.id}: ${field} must be a nonnegative integer.`,
    );
  assert(entry.family === 4, `Cloud ${entry.id}: expected an IPv4 profile.`);
  assert(
    Array.isArray(entry.variants) &&
      entry.variants.length > 0 &&
      entry.variants.every(slug) &&
      unique(entry.variants),
    `Cloud ${entry.id}: variants must be a nonempty unique slug list.`,
  );
  assert(
    entry.firstReserved + entry.lastReserved === entry.reserved,
    `Cloud ${entry.id}: reservation counts do not reconcile.`,
  );
  requireSource(entry, 'source', `Cloud ${entry.id}`);
  assert(
    validDate(entry.reviewedAt) && validDate(entry.version),
    `Cloud ${entry.id}: invalid version/review date.`,
  );
}
for (const id of ['aws', 'azure', 'gcp'])
  assert(
    get('cloud-profiles').some((entry) => entry.id === id),
    `Missing cloud profile ${id}.`,
  );
const templates = get('network-templates');
assert(templates.length >= 4, 'Provide all four network design templates.');
for (const id of ['home', 'smb', 'campus', 'data-center'])
  assert(
    templates.some((entry) => entry.id === id),
    `Missing network template ${id}.`,
  );
for (const template of templates)
  checkAction(`Template ${template.id}`, () => {
    requireText(template, ['name', 'description', 'network', 'policy'], `Template ${template.id}`);
    assert(
      Array.isArray(template.segments) && template.segments.length >= 3,
      `Template ${template.id}: provide at least three useful segments.`,
    );
    assert(
      Array.isArray(template.notes) && template.notes.length >= 2,
      `Template ${template.id}: include operational notes.`,
    );
    const parent = subnet(template.network, 4);
    const allocated = [];
    const ipv6 = [];
    for (const segment of template.segments) {
      requireText(
        segment,
        ['name', 'cidr', 'gateway', 'purpose', 'ipv6'],
        `Template ${template.id}, ${segment.name}`,
      );
      const network = subnet(segment.cidr, 4);
      const dual = subnet(segment.ipv6, 6);
      const gateway = BigInt(v4(segment.gateway));
      assert(
        network.start >= parent.start && network.end <= parent.end,
        `Template ${template.id}: ${segment.cidr} lies outside parent.`,
      );
      assert(
        network.address === network.start && dual.address === dual.start,
        `Template ${template.id}, ${segment.name}: allocations must be aligned.`,
      );
      assert(
        Number.isInteger(segment.hosts) &&
          segment.hosts > 0 &&
          BigInt(segment.hosts) <= network.size - 2n,
        `Template ${template.id}, ${segment.name}: host requirement exceeds conventional capacity.`,
      );
      assert(
        gateway > network.start && gateway < network.end,
        `Template ${template.id}, ${segment.name}: gateway must be a usable address.`,
      );
      assert(
        Number.isInteger(segment.vlan) && segment.vlan >= 1 && segment.vlan <= 4094,
        `Template ${template.id}, ${segment.name}: VLAN must be 1–4094.`,
      );
      allocated.push(network);
      ipv6.push(dual);
    }
    for (const entries of [allocated, ipv6])
      for (let first = 0; first < entries.length; first += 1)
        for (let second = first + 1; second < entries.length; second += 1)
          assert(
            entries[first].end < entries[second].start ||
              entries[second].end < entries[first].start,
            `Template ${template.id}: overlapping IPv${entries[first].family} segment allocations.`,
          );
    assert(
      unique(template.segments.map((segment) => segment.vlan)),
      `Template ${template.id}: duplicate VLAN identifiers.`,
    );
  });

if (!process.argv.includes('--data-only')) {
  const requiredFiles = [
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.nvmrc',
    '.prettierrc',
    '.eslintrc',
    'eslint.config.mjs',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'tsconfig.base.json',
    'README.md',
    'LICENSE',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'THIRD_PARTY_NOTICES.md',
    'docker-compose.yml',
    'vercel.json',
    'render.yaml',
    '.github/workflows/ci.yml',
    'apps/web/.env.example',
    'apps/api/.env.example',
    'apps/web/Dockerfile',
    'apps/api/Dockerfile',
    'apps/web/tsconfig.json',
    'apps/api/tsconfig.json',
    'apps/web/src/App.tsx',
    'apps/api/src/app.ts',
    'packages/netcalc/src/index.ts',
    'packages/shared/src/index.ts',
    'supabase/config.toml',
    'supabase/seed.sql',
    'scripts/generate-seo.mjs',
    'scripts/validate-data.mjs',
    'docs/environment.md',
    'docs/deployment.md',
    'docs/testing.md',
    'docs/requirements-matrix.md',
    'apps/web/public/favicon.svg',
    'apps/web/public/social-card.svg',
    'apps/web/public/social-card.png',
    'apps/web/public/icon-192.png',
    'apps/web/public/icon-512.png',
  ];
  requiredFiles.push(
    'docs/verification.md',
    'scripts/package-release.py',
    'vitest.config.ts',
    'playwright.config.ts',
    'apps/api/jest.config.cjs',
    'packages/netcalc/tsconfig.json',
    'packages/shared/tsconfig.json',
    '.husky/pre-commit',
    'patches/@rollup__plugin-terser@1.0.0.patch',
    'apps/web/src/assets/fonts/DejaVuSans.ttf',
    'apps/web/src/assets/fonts/DejaVuSans-Bold.ttf',
    'apps/web/src/assets/fonts/LICENSE.txt',
    'docs/phases/phase-00-research.pdf',
    ...Array.from(
      { length: 12 },
      (_, phase) => `docs/phases/phase-${String(phase).padStart(2, '0')}.md`,
    ),
  );
  for (const file of requiredFiles) {
    try {
      await access(join(root, file), constants.R_OK);
      assert(
        (await stat(join(root, file))).size > 0,
        `Required source/delivery file is empty: ${file}`,
      );
    } catch {
      errors.push(`Missing required source/delivery file: ${file}`);
    }
  }
  const migrations = (await readdir(join(root, 'supabase/migrations'))).filter((file) =>
    file.endsWith('.sql'),
  );
  assert(migrations.length >= 1, 'At least one complete SQL migration is required.');
  const ignore = await readFile(join(root, '.gitignore'), 'utf8');
  for (const [pattern, label] of [
    [/node_modules/, 'node_modules'],
    [/dist/, 'dist'],
    [/(?:^|\n)build\//, 'build/'],
    [/\.env/, '.env variants'],
    [/(?:^|\n)logs\//, 'logs/'],
    [/coverage/, 'coverage'],
    [/\.DS_Store/, '.DS_Store'],
    [/\.vscode/, '.vscode local settings'],
    [/\*\.log/, '*.log'],
    [/\.turbo/, '.turbo/'],
    [/\.vercel/, '.vercel/'],
    [/\.supabase/, '.supabase/'],
    [/(?:tmp|temp|\*\.swp|\*\.tmp)/, 'temporary files'],
  ])
    assert(pattern.test(ignore), `.gitignore is missing required exclusion ${label}.`);
  for (const app of ['web', 'api']) {
    const example = await readFile(join(root, `apps/${app}/.env.example`), 'utf8');
    assert(!/^\s*#/m.test(example), `apps/${app}/.env.example must remain comment-free.`);
    assert(
      example
        .split(/\r?\n/)
        .filter(Boolean)
        .every((line) => /^[A-Z][A-Z0-9_]*=/.test(line)),
      `apps/${app}/.env.example has malformed variable lines.`,
    );
    const docs = await readFile(join(root, 'docs/environment.md'), 'utf8').catch(() => '');
    for (const line of example.split(/\r?\n/).filter(Boolean))
      assert(
        docs.includes(line.split('=')[0]),
        `docs/environment.md does not document ${line.split('=')[0]}.`,
      );
  }
}
if (errors.length) {
  process.stderr.write(
    `Validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:\n${errors.map((error) => `- ${error}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else
  process.stdout.write(
    JSON.stringify(
      {
        valid: true,
        datasets: Object.fromEntries(
          Object.entries(datasets).map(([key, value]) => [key, value.length]),
        ),
        courseWordCount,
        independentlyCheckedQuizAnswers: checkedAnswers,
        requiredFilesChecked: !process.argv.includes('--data-only'),
      },
      null,
      2,
    ) + '\n',
  );
