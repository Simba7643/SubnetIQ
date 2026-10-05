import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps/web');
const dist = join(web, 'dist');
const requireWeb = createRequire(join(web, 'package.json'));
const [{ default: Markdown }, { default: remarkGfm }, { generateSW }] = await Promise.all([
  import(pathToFileURL(requireWeb.resolve('react-markdown')).href),
  import(pathToFileURL(requireWeb.resolve('remark-gfm')).href),
  import(pathToFileURL(requireWeb.resolve('workbox-build')).href),
]);
const { calculate } = await import(
  pathToFileURL(join(root, 'packages/netcalc/dist/index.js')).href
);
const env = { ...loadEnv('production', web, 'VITE_'), ...process.env };
const configuredOrigin = env.VITE_SITE_URL || 'http://localhost:5173';
const origin = new URL(configuredOrigin);
if (
  !['https:', 'http:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  !['', '/'].includes(origin.pathname)
)
  throw new Error(
    'VITE_SITE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.',
  );
const site = origin.origin;
const appName = String(env.VITE_APP_NAME || 'SubnetIQ').trim();
if (!appName || appName.length > 60) throw new Error('VITE_APP_NAME must have 1–60 characters.');
const releaseDate = '2026-10-04';
const privateRoots = ['/api', '/auth', '/login', '/account', '/projects', '/share', '/assistant'];
const canonical = (path) => new URL(path, `${site}/`).href;
const escape = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const markdown = (text) =>
  renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkGfm], skipHtml: true }, text),
  );
const asList = (items) => `<ul>${items.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>`;
const links = (items) =>
  `<ul class="static-link-list">${items.map((item) => `<li><h2><a href="${escape(item.path)}">${escape(item.title)}</a></h2><p>${escape(item.description)}</p></li>`).join('')}</ul>`;
const table = (columns, rows) =>
  `<div class="static-table-wrap"><table><thead><tr>${columns.map((column) => `<th scope="col">${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escape(row[column.key] === null ? 'Context-dependent / unspecified' : row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

function literal(node, skipped = new Set(['icon'])) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    return literal(node.expression, skipped);
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((element) => literal(element, skipped));
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property))
        throw new Error('SEO metadata must use explicit literal object properties.');
      const key =
        ts.isIdentifier(property.name) ||
        ts.isStringLiteralLike(property.name) ||
        ts.isNumericLiteral(property.name)
          ? property.name.text
          : null;
      if (key === null) throw new Error('SEO metadata cannot use a computed object key.');
      if (!skipped.has(key)) value[key] = literal(property.initializer, skipped);
    }
    return value;
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken)
    return -literal(node.operand, skipped);
  throw new Error(`Unsupported expression in SEO metadata: ${node.getText().slice(0, 90)}`);
}

async function sourceValue(path, name) {
  const source = ts.createSourceFile(
    path,
    await readFile(join(root, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let found;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    )
      found = literal(node.initializer);
    if (found === undefined) ts.forEachChild(node, visit);
  }
  visit(source);
  if (found === undefined)
    throw new Error(
      `Could not read ${name} from ${path}. Keep route metadata in explicit literals.`,
    );
  return found;
}

const [
  tools,
  sections,
  courses,
  glossary,
  articles,
  ports,
  protocols,
  oui,
  templates,
  threats,
  commands,
  cvss,
  policies,
  faqs,
  layers,
  publicPageDescriptions,
] = await Promise.all([
  sourceValue('apps/web/src/features/calculators/toolDefinitions.ts', 'toolDefinitions'),
  sourceValue('apps/web/src/features/toolkit/ToolkitPage.tsx', 'toolkitSections'),
  json('data/courses.json'),
  json('data/glossary.json'),
  json('data/articles.json'),
  json('data/ports.json'),
  json('data/protocols.json'),
  json('data/oui-subset.json'),
  json('data/network-templates.json'),
  json('data/threats.json'),
  json('data/commands.json'),
  json('data/cvss.json'),
  sourceValue('apps/web/src/pages/LegalPage.tsx', 'policies'),
  sourceValue('apps/web/src/pages/HomePage.tsx', 'faqs'),
  sourceValue('apps/web/src/features/toolkit/ReferenceTools.tsx', 'layers'),
  sourceValue('apps/web/src/components/Seo.tsx', 'publicPageDescriptions'),
]);
const pages = new Map();
function add(path, title, description, body, schema = {}, options = {}) {
  if (pages.has(path)) throw new Error(`Duplicate static route: ${path}`);
  if (!path.startsWith('/') || path.includes('..') || path.includes('?') || path.includes('#'))
    throw new Error(`Unsafe static route: ${path}`);
  if (publicPageDescriptions[path]) [title, description] = publicPageDescriptions[path];
  pages.set(path, { path, title, description, body, schema, ...options });
}
function resultBody(result) {
  return `<section><h2>Worked example</h2><p>This example uses the same deterministic calculation engine as the interactive tool.</p><h3>Inputs and assumptions</h3><pre><code>${escape(JSON.stringify(result.normalizedInput, null, 2))}</code></pre><dl class="static-results">${result.summary.map((field) => `<div><dt>${escape(field.label)}</dt><dd>${escape(field.value)}${field.description ? `<p>${escape(field.description)}</p>` : ''}</dd></div>`).join('')}</dl>${result.rows && result.columns ? table(result.columns, result.rows) : ''}${result.warnings.length ? `<h3>Assumptions and limits</h3>${asList(result.warnings)}` : ''}<h2>How the calculation works</h2>${result.steps.map((step) => `<section><h3>${escape(step.title)}</h3><p>${escape(step.description)}</p>${step.formula ? `<pre><code>${escape(step.formula)}</code></pre>` : ''}</section>`).join('')}${result.sources?.length ? `<h3>Primary references</h3><ul>${result.sources.map((url) => `<li><a href="${escape(url)}" rel="noreferrer">${escape(url)}</a></li>`).join('')}</ul>` : ''}</section>`;
}
const toolItems = tools.map((tool) => ({ ...tool, path: `/tools/${tool.id}` }));
const courseItems = courses.map((course) => ({ ...course, path: `/learn/${course.id}` }));
const articleItems = articles.map((article) => ({ ...article, path: `/blog/${article.id}` }));
const sectionItems = sections.map((section) => ({ ...section, path: `/toolkit/${section.id}` }));
const itemList = (items) => ({
  '@type': 'ItemList',
  numberOfItems: items.length,
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.title,
    url: canonical(item.path),
  })),
});

add(
  '/',
  'Network clarity, bit by bit',
  'Calculate IPv4 and IPv6 subnets, plan VLSM networks, and learn the reasoning behind every result with SubnetIQ.',
  `<p>Calculate with confidence. Plan with precision. Understand the reasoning behind every subnet in one connected workspace.</p><p><a href="/tools/ipv4-subnet">Open the IPv4 subnet calculator</a> · <a href="/learn">Start the learning path</a></p><section><h2>One connected networking workspace</h2><p>${tools.length} mathematical tools, ${glossary.length} glossary entries, ${courses.length} courses, ${articles.length} field notes, and practical security references.</p></section>${links(toolItems.filter((tool) => ['ipv4-subnet', 'ipv6-subnet', 'vlsm', 'aggregate'].includes(tool.id)))}${resultBody(calculate('ipv4-subnet', tools.find((tool) => tool.id === 'ipv4-subnet').defaults))}<section><h2>Frequently asked questions</h2>${faqs.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('')}</section>`,
  { '@type': 'WebPage' },
  {
    extraSchema: [
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(([name, text]) => ({
          '@type': 'Question',
          name,
          acceptedAnswer: { '@type': 'Answer', text },
        })),
      },
    ],
  },
);
add(
  '/tools',
  'IP and subnetting calculators',
  'Browse IPv4, IPv6, VLSM, CIDR, address-conversion, bandwidth, and MTU calculators with exact results and worked explanations.',
  links(toolItems),
  itemList(toolItems),
);
for (const tool of toolItems) {
  const result = calculate(tool.id, tool.defaults);
  add(
    tool.path,
    tool.title,
    tool.description,
    `<p>${escape(tool.description)}</p><p>Change the example inputs in the interactive calculator. Core calculations work locally without an account.</p>${resultBody(result)}<section><h2>Keep learning</h2><p><a href="/learn">Follow the subnetting lessons</a>, <a href="/practice">practice a related question</a>, or <a href="/tools">explore another calculator</a>.</p></section>`,
    {
      '@type': 'SoftwareApplication',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web browser',
      softwareVersion: result.engineVersion,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  );
}
add(
  '/learn',
  'Networking and subnetting learning path',
  'Study twelve complete networking lessons, from binary and CIDR through VLSM, IPv6, NAT, DHCP, DNS, and routing.',
  `<p>Read the concepts, work through concrete examples, and carry the same reasoning into a calculator or practice session.</p>${links(courseItems)}`,
  itemList(courseItems),
);
for (const course of courseItems)
  add(
    course.path,
    course.title,
    course.description,
    `<p>${escape(course.description)}</p><p>${course.readingMinutes} minute lesson · ${escape(course.category)}</p><section><h2>Learning objectives</h2>${asList(course.objectives)}</section><article>${markdown(course.content)}</article><p><a href="/learn">All lessons</a> · <a href="/practice">Practice these concepts</a></p>`,
    {
      '@type': 'Course',
      educationalLevel: course.category,
      provider: { '@type': 'Organization', name: appName },
      isAccessibleForFree: true,
    },
  );
add(
  '/glossary',
  'Networking and subnetting glossary',
  `Search ${glossary.length} explained networking terms with practical examples and related concepts across addressing, routing, switching, protocols, and security.`,
  `<p>Every entry includes a definition, a concrete example, and related concepts. The interactive view supports category and text filtering.</p><dl>${glossary.map((entry) => `<div class="static-term" id="${escape(entry.id)}"><dt><h2>${escape(entry.term)}</h2></dt><dd><p><strong>${escape(entry.category)}</strong></p><p>${escape(entry.definition)}</p><p><strong>Example:</strong> ${escape(entry.example)}</p><p>Related: ${entry.related.map((id) => `<a href="#${escape(id)}">${escape(glossary.find((term) => term.id === id)?.term ?? id)}</a>`).join(', ')}</p></dd></div>`).join('')}</dl>`,
  {
    '@type': 'DefinedTermSet',
    hasDefinedTerm: glossary.map((entry) => ({
      '@type': 'DefinedTerm',
      name: entry.term,
      description: entry.definition,
      termCode: entry.id,
      url: `${canonical('/glossary')}#${entry.id}`,
    })),
  },
);
const questions = await json('data/quiz-bank.json');
add(
  '/practice',
  'Subnetting practice lab and quizzes',
  'Practice subnetting with generated and curated questions, explanations, timers, scoring, streaks, and topic feedback.',
  `<p>Choose beginner, intermediate, advanced, or exam practice. The interactive lab creates deterministic questions from a seed and provides explanations after each answer. Guest practice is available immediately; sign in for durable history.</p><section><h2>Sample practice questions</h2>${[
    'beginner',
    'intermediate',
    'advanced',
    'exam',
  ]
    .map((difficulty) => {
      const question = questions.find((entry) => entry.difficulty === difficulty);
      return question
        ? `<section><h3>${escape(difficulty)}: ${escape(question.question)}</h3>${asList(question.options)}<details><summary>Read the answer and explanation</summary><p><strong>${escape(question.options[question.correctIndex])}</strong></p><p>${escape(question.explanation)}</p></details></section>`
        : '';
    })
    .join(
      '',
    )}</section><p><a href="/learn/subnetting">Review subnetting</a> · <a href="/learn/vlsm">Review VLSM</a></p>`,
  {
    '@type': 'LearningResource',
    learningResourceType: 'Practice exercises',
    isAccessibleForFree: true,
  },
);
const masks = calculate('netmask-table', { min: 0, max: 32, policy: 'lan' });
add(
  '/cheatsheets',
  'Printable networking cheat sheets',
  'Print CIDR masks, powers of two, private address ranges, common ports, and OSI/TCP-IP reference tables.',
  `<p>Use these compact references while checking an address plan or practicing. The interactive page provides print and export controls.</p><h2>IPv4 CIDR and masks</h2>${table(masks.columns, masks.rows)}<h2>Binary powers of two</h2>${table(
    [
      { key: 'power', label: 'Power' },
      { key: 'value', label: 'Exact value' },
    ],
    Array.from({ length: 33 }, (_, index) => ({
      power: `2^${index}`,
      value: (1n << BigInt(index)).toString(),
    })),
  )}<h2>Private IPv4 ranges</h2>${table(
    [
      { key: 'network', label: 'CIDR' },
      { key: 'range', label: 'Inclusive range' },
    ],
    [
      { network: '10.0.0.0/8', range: '10.0.0.0–10.255.255.255' },
      { network: '172.16.0.0/12', range: '172.16.0.0–172.31.255.255' },
      { network: '192.168.0.0/16', range: '192.168.0.0–192.168.255.255' },
    ],
  )}<h2>Common ports</h2>${table(
    [
      { key: 'port', label: 'Port' },
      { key: 'transport', label: 'Transport' },
      { key: 'service', label: 'Service' },
    ],
    ports,
  )}<h2>OSI and TCP/IP model</h2>${table(
    [
      { key: 'number', label: 'OSI layer' },
      { key: 'title', label: 'Name' },
      { key: 'group', label: 'TCP/IP group' },
      { key: 'unit', label: 'Data unit' },
    ],
    layers,
  )}`,
  { '@type': 'LearningResource', learningResourceType: 'Reference sheet' },
);
add(
  '/toolkit',
  'Networking and cybersecurity toolkit',
  'Explore protocol references, DNS and registration lookups, firewall helpers, local password and hash tools, and defensive learning cards.',
  links(sectionItems),
  itemList(sectionItems),
);
for (const section of sectionItems) {
  let body = `<p>${escape(section.description)}</p><p>Mode: ${escape(section.mode)}.</p>`;
  if (section.id === 'ports')
    body += `<h2>Common ports</h2>${table(
      [
        { key: 'port', label: 'Port' },
        { key: 'transport', label: 'Transport' },
        { key: 'service', label: 'Service' },
        { key: 'description', label: 'Purpose' },
        { key: 'security', label: 'Security note' },
      ],
      ports,
    )}<h2>Protocols</h2>${table(
      [
        { key: 'name', label: 'Protocol' },
        { key: 'layer', label: 'Layer' },
        { key: 'description', label: 'Purpose' },
        { key: 'uses', label: 'Example' },
      ],
      protocols,
    )}<p>This is a curated reference. A port number does not prove which service is running.</p>`;
  else if (section.id === 'osi')
    body += layers
      .map(
        (layer) =>
          `<section><h2>Layer ${layer.number}: ${escape(layer.title)}</h2><p>${escape(layer.purpose)}</p><p>TCP/IP: ${escape(layer.group)}. Data unit: ${escape(layer.unit)}.</p><p>Examples: ${escape(layer.examples)}.</p><p>${escape(layer.symptom)}</p></section>`,
      )
      .join('');
  else if (section.id === 'mac')
    body += `${resultBody(calculate('mac', { address: '00:00:0C:12:34:56' }))}<h2>Bundled OUI subset</h2>${table(
      [
        { key: 'prefix', label: 'Prefix' },
        { key: 'vendor', label: 'Registration name' },
      ],
      oui,
    )}<p>This subset is explicitly limited. Locally administered or randomized addresses do not support reliable vendor attribution.</p>`;
  else if (section.id === 'dns')
    body +=
      '<h2>Understand the requested record type</h2>' +
      table(
        [
          { key: 'type', label: 'Record' },
          { key: 'meaning', label: 'Meaning' },
        ],
        [
          { type: 'A', meaning: 'Maps a name to an IPv4 address.' },
          { type: 'AAAA', meaning: 'Maps a name to an IPv6 address.' },
          { type: 'MX', meaning: 'Identifies mail exchangers and preferences.' },
          { type: 'TXT', meaning: 'Carries application-defined text records.' },
          { type: 'NS', meaning: 'Identifies authoritative name servers.' },
          { type: 'CNAME', meaning: 'Aliases one name to another canonical name.' },
          { type: 'PTR', meaning: 'Maps a reverse DNS owner name to a host name.' },
        ],
      ) +
      '<p>A live query requires the backend. Results identify the configured resolver, retrieval time, and cache status. The static page does not invent lookup results.</p><p><a href="/blog/dns-records-troubleshooting">Read the DNS troubleshooting guide</a></p>';
  else if (section.id === 'ip-info')
    body +=
      '<h2>Read registration records in context</h2><p>IP registration information describes allocation records and associated organizations. It does not establish the physical location, identity, or activity of a particular user.</p><p>The backend retrieves RDAP through approved destinations, caches bounded results, and supports an explicitly configured allowlisted WHOIS fallback. A live request requires the API connection.</p>';
  else if (section.id === 'firewall')
    body += `${resultBody(calculate('wildcard', { address: '192.0.2.0/24' }))}<h2>Review generated rules</h2><p>The interactive helper supports iptables, UFW, Cisco ACLs, and a pfSense-style worksheet. Check the address family, direction, protocol, port, existing rules, and default policy before applying a rule. It creates reviewable text and does not change a firewall.</p>`;
  else if (section.id === 'passwords')
    body +=
      '<h2>Assess predictable password patterns locally</h2><p>The browser estimates the strength of a supplied password using a local pattern estimator. The assessment can explain repeated sequences, common words, and other predictable patterns.</p><p>Password text is excluded from exports, share links, history, analytics, and AI context. No password is prefilled in this example. A strength estimate is not a guarantee against every attack; use unique passwords and multifactor authentication where available.</p>';
  else if (section.id === 'hashes')
    body +=
      '<h2>Generate a SHA-2 digest in the browser</h2><p>Choose SHA-256, SHA-384, or SHA-512. The application encodes text as UTF-8 and computes the digest using Web Crypto. The displayed hexadecimal digest can be copied or exported.</p><p>The original input stays local and is excluded from share URLs and exported result metadata. Hashing is not encryption, and a general-purpose SHA-2 digest is not a password-storage scheme.</p>';
  else if (section.id === 'http-tls')
    body +=
      '<h2>Read HTTP headers with their context</h2><p>Headers describe a request or response. Content-Type describes representation format; Cache-Control directs cache behavior; Location identifies a redirection target; Set-Cookie requests cookie storage; Content-Security-Policy limits resource use in supporting browsers. Inspect the complete message and response status before drawing conclusions.</p><h2>Understand TLS 1.3</h2><p>Client and server negotiate supported parameters, exchange key agreement material, authenticate the server using a certificate, and derive traffic keys. The protected channel then carries application data. Certificate validation checks the chain and intended server name; encryption alone does not make an application trustworthy.</p><p>The interactive reference parses a pasted header block locally and visualizes the handshake. It does not contact an arbitrary URL.</p>';
  else if (section.id === 'threats')
    body += threats
      .map(
        (entry) =>
          `<section><h2>${escape(entry.name)}</h2><p>${escape(entry.description)}</p><h3>Possible indicators</h3>${asList(entry.indicators)}<h3>Defenses</h3>${asList(entry.defenses)}<p><a href="${escape(entry.source)}" rel="noreferrer">Primary reference</a></p></section>`,
      )
      .join('');
  else if (section.id === 'cvss')
    body += `<p>CVSS describes technical severity. Exposure, asset value, and business impact still matter to a local risk assessment. The vector interpreter explains metrics and links to FIRST for numerical scoring.</p>${cvss.map((entry) => `<section><h2>${escape(entry.title)}</h2><p>${escape(entry.description)}</p><p>${escape(entry.example)}</p><p><a href="${escape(entry.source)}" rel="noreferrer">Primary reference</a></p></section>`).join('')}`;
  else if (section.id === 'commands')
    body += commands
      .map(
        (entry) =>
          `<section><h2>${escape(entry.name)}</h2><p>${escape(entry.purpose)}</p><p>Platform: ${escape(entry.platform)}.</p><pre><code>${escape(entry.syntax)}\n${escape(entry.example)}</code></pre><p>${escape(entry.caution)}</p><p><a href="${escape(entry.source)}" rel="noreferrer">Command reference</a></p></section>`,
      )
      .join('');
  else if (section.id === 'bandwidth' || section.id === 'mtu')
    body += resultBody(
      calculate(section.id, tools.find((tool) => tool.id === section.id).defaults),
    );
  else throw new Error(`No static content renderer exists for toolkit section ${section.id}.`);
  add(section.path, section.title, section.description, body, { '@type': 'WebPage' });
}
add(
  '/templates',
  'Home, SMB, campus, and data-center network templates',
  'Start from four complete sample address plans with VLANs, gateways, purpose, IPv4 networks, and paired IPv6 examples.',
  templates
    .map(
      (template) =>
        `<section id="${escape(template.id)}"><h2>${escape(template.name)}</h2><p>${escape(template.description)}</p><p>Parent network: <code>${escape(template.network)}</code>.</p>${table(
          [
            { key: 'name', label: 'Segment' },
            { key: 'hosts', label: 'Hosts' },
            { key: 'vlan', label: 'VLAN' },
            { key: 'cidr', label: 'IPv4 subnet' },
            { key: 'gateway', label: 'Gateway' },
            { key: 'ipv6', label: 'IPv6 example' },
            { key: 'purpose', label: 'Purpose' },
          ],
          template.segments,
        )}${asList(template.notes)}</section>`,
    )
    .join(''),
  { '@type': 'CollectionPage' },
);
add(
  '/blog',
  'Networking field notes and worked guides',
  'Read five original practical guides on CIDR host counts, VLSM, IPv6 planning, wildcard masks, and DNS troubleshooting.',
  links(articleItems),
  itemList(articleItems),
);
for (const article of articleItems) {
  const content = await readFile(join(root, 'content/blog', article.file), 'utf8');
  add(
    article.path,
    article.title,
    article.description,
    `<p>${escape(article.description)}</p><p><time datetime="${escape(article.publishedAt)}">Published ${escape(article.publishedAt)}</time> · ${article.readingMinutes} minute read · ${escape(article.category)}</p><article>${markdown(stripFrontmatter(content))}</article><p><a href="/blog">All field notes</a> · <a href="/tools">Try a calculator</a></p>`,
    {
      '@type': 'BlogPosting',
      headline: article.title,
      datePublished: article.publishedAt,
      dateModified: article.publishedAt,
      mainEntityOfPage: canonical(article.path),
      publisher: {
        '@type': 'Organization',
        name: appName,
        logo: { '@type': 'ImageObject', url: canonical('/icon-512.png'), width: 512, height: 512 },
      },
    },
  );
}
add(
  '/about',
  'About SubnetIQ',
  'Learn how SubnetIQ connects exact address mathematics, clear explanations, guided learning, and practical network planning.',
  `<p>${escape(appName)} brings calculations, address planning, guided learning, and networking references into a single workspace.</p><h2>The answer is a starting point</h2><p>Each calculation keeps its inputs, assumptions, and explanation together. IPv4 and IPv6 calculations use exact arithmetic, and allocation policies identify their reservations.</p><h2>From fundamentals to fieldwork</h2><p>Read ${courses.length} courses and ${glossary.length} glossary entries, then apply those concepts in practice, address plans, and reference tools.</p><h2>Inspectable implementation</h2><p>The source release includes the application, tests, database migrations, and deployment documentation. Account services and live AI depend on the installation configuration.</p><p><a href="/contact">Contact the operator</a></p>`,
);
add(
  '/contact',
  'Contact and feedback',
  'Send feedback about calculations, explanations, accessibility, or this SubnetIQ installation to its operator.',
  '<p>Use the interactive contact form to describe a calculation issue, unclear explanation, accessibility problem, or deployment question. Include the tool name, relevant non-sensitive inputs, expected behavior, and what happened.</p><p>The form requires the configured application API and feedback storage. It reports whether the request was saved. Do not include passwords, API keys, or confidential network details in a public support request.</p><p><a href="/privacy">Read the privacy policy</a> · <a href="/about">About this workspace</a></p>',
);
for (const kind of ['privacy', 'terms', 'cookies'])
  add(
    `/${kind}`,
    policies[kind].title,
    policies[kind].description,
    `<p>Release policy baseline · ${releaseDate}</p><article>${markdown(policies[kind].content)}</article><p><a href="/contact">Contact the operator</a></p>`,
  );

const appSource = await readFile(join(web, 'src/App.tsx'), 'utf8');
const literalRoutes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
for (const path of literalRoutes)
  if (
    !path.includes(':') &&
    !path.includes('*') &&
    !privateRoots.some((entry) => path === entry || path.startsWith(`${entry}/`)) &&
    !pages.has(path)
  )
    throw new Error(
      `Public App route ${path} has no SEO content. Add it to scripts/generate-seo.mjs.`,
    );
for (const path of pages.keys())
  if (
    !literalRoutes.some(
      (route) =>
        route === path ||
        (route.includes(':') && new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}$`).test(path)),
    )
  )
    throw new Error(`Generated SEO route ${path} has no matching App route.`);

await access(join(dist, 'index.html'), constants.R_OK).catch(() => {
  throw new Error(
    'Build apps/web with Vite before generating SEO pages; apps/web/dist/index.html is missing.',
  );
});
let shell = await readFile(join(dist, 'index.html'), 'utf8');
if (!shell.includes('/assets/') || !shell.includes('<div id="root"'))
  throw new Error(
    'SEO generation requires the compiled Vite index.html with bundled assets and a #root container.',
  );
const rootMatch = /<div\s+id="root"[^>]*>[\s\S]*?<\/div>(?=\s*(?:<noscript|<script|<\/body))/;
if (!rootMatch.test(shell))
  throw new Error('Cannot locate the complete #root container in the Vite HTML shell.');
shell = shell
  .replace(/<title>[\s\S]*?<\/title>/gi, '')
  .replace(
    /<meta\s+[^>]*(?:name="(?:description|keywords|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi,
    '',
  )
  .replace(/<link\s+[^>]*rel="canonical"[^>]*>/gi, '')
  .replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\s+id="static-page-styles">[\s\S]*?<\/style>/gi, '');
const style =
  '<style id="static-page-styles">.static-shell{max-width:1080px;margin:auto;padding:28px 24px 64px;color:#172b40;font:16px/1.65 system-ui,sans-serif;background:#fff}.static-shell a{color:#08695e;text-decoration:underline;text-underline-offset:3px}.static-shell h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.14;margin:28px 0 16px}.static-shell h2{font-size:1.5rem;margin:32px 0 12px}.static-shell h3{font-size:1.12rem;margin:24px 0 8px}.static-shell p{margin:12px 0}.static-shell ul,.static-shell ol{padding-left:24px}.static-shell pre{overflow:auto;background:#edf4f7;padding:16px;border-radius:8px;white-space:pre-wrap}.static-shell table{border-collapse:collapse;width:100%;font-size:.92rem}.static-shell th,.static-shell td{padding:10px 12px;text-align:left;border:1px solid #c5d2dc;vertical-align:top}.static-shell th{background:#edf4f7}.static-table-wrap{overflow:auto;margin:18px 0}.static-header{display:flex;gap:24px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #c5d2dc;padding-bottom:18px}.static-header nav{display:flex;flex-wrap:wrap;gap:18px}.static-brand{font-weight:750;font-size:1.35rem;display:flex;gap:10px;align-items:center}.static-notice{padding:14px 18px;background:#eaf8f4;border-radius:8px}.static-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.static-results>div{padding:12px;border:1px solid #c5d2dc;border-radius:8px;overflow-wrap:anywhere}.static-results dt{font-weight:650}.static-results dd{margin:6px 0 0}.static-results dd p{font-size:.85rem}.static-term{border-bottom:1px solid #c5d2dc;padding-bottom:18px}.static-term dd{margin:0}.static-link-list{list-style:none;padding:0!important;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.static-link-list li{border:1px solid #c5d2dc;padding:18px;border-radius:8px}.static-link-list h2{margin:0}.static-shell details{padding:14px 0;border-bottom:1px solid #c5d2dc}.static-shell summary{cursor:pointer;font-weight:650}.static-footer{border-top:1px solid #c5d2dc;margin-top:36px;padding-top:20px}.static-skip{display:inline-block;margin-bottom:10px}@media print{.static-header,.static-notice,.static-footer{display:none}.static-shell{max-width:none;padding:0}.static-table-wrap{overflow:visible}a{color:inherit!important}}</style>';

function render(page) {
  const title = `${page.title} | ${appName}`;
  const url = canonical(page.path);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${site}/#website`, name: appName, url: canonical('/') },
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        name: page.title,
        description: page.description,
        url,
        inLanguage: 'en',
        isPartOf: { '@id': `${site}/#website` },
        image: canonical('/social-card.png'),
        ...page.schema,
      },
      ...(page.extraSchema || []),
    ],
  };
  const encodedSchema = JSON.stringify(schema)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  const metadata = `<title>${escape(title)}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${page.noindex ? 'noindex, noarchive' : 'index, follow, max-image-preview:large'}"><link rel="canonical" href="${escape(url)}"><meta property="og:site_name" content="${escape(appName)}"><meta property="og:type" content="${page.schema['@type'] === 'BlogPosting' ? 'article' : 'website'}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(canonical('/social-card.png'))}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(`${appName}: Network clarity, bit by bit`)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${escape(canonical('/social-card.png'))}"><script type="application/ld+json" id="page-schema" data-page-path="${escape(page.path)}" data-page-url="${escape(url)}">${encodedSchema}</script>${style}`;
  const body = `<div id="root"><div class="static-shell"><a class="static-skip" href="#static-main">Skip to content</a><header class="static-header"><a class="static-brand" href="/"><img src="/favicon.svg" alt="" width="32" height="32">${escape(appName)}</a><nav aria-label="Primary navigation"><a href="/tools">Calculators</a><a href="/learn">Learn</a><a href="/practice">Practice</a><a href="/toolkit">Toolkit</a><a href="/blog">Field notes</a></nav></header><main id="static-main"><h1>${escape(page.title)}</h1><noscript><p class="static-notice">You can read this page and its worked examples without JavaScript. Enable JavaScript to change calculator inputs, search, practice interactively, or use account services.</p></noscript>${page.body}</main><footer class="static-footer"><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/cookies">Cookie controls</a></footer></div></div>`;
  return shell.replace('</head>', `${metadata}</head>`).replace(rootMatch, () => body);
}

for (const page of pages.values()) {
  const directory = page.path === '/' ? dist : join(dist, page.path.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), render(page), 'utf8');
}
const missingPage = {
  path: '/404',
  title: 'Page not found',
  description:
    'This address does not match a SubnetIQ page. Browse the calculator suite, learning path, or networking toolkit.',
  body: '<p>The requested page is not available.</p><p><a href="/tools">Browse calculators</a> · <a href="/learn">Open the learning path</a> · <a href="/toolkit">Explore the toolkit</a></p>',
  schema: { '@type': 'WebPage' },
  noindex: true,
};
await writeFile(join(dist, '404.html'), render(missingPage), 'utf8');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.values()].map((page) => `  <url><loc>${escape(canonical(page.path))}</loc><lastmod>${escape(page.schema.dateModified || releaseDate)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');
const robots = `User-agent: *\nAllow: /\n${privateRoots.map((path) => `Disallow: ${path}`).join('\n')}\nDisallow: /404\n\nSitemap: ${canonical('/sitemap.xml')}\n`;
await writeFile(join(dist, 'robots.txt'), robots, 'utf8');
const buildReport = {
  site,
  appName,
  generatedRoutes: pages.size,
  routes: [...pages.keys()],
  tools: tools.length,
  courses: courses.length,
  articles: articles.length,
  toolkitSections: sections.length,
  privateRoutesExcluded: privateRoots,
  semanticFallback: 'Readable HTML inside #root, replaced by React createRoot',
  canonicalConfiguredForProduction:
    origin.protocol === 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
    !origin.hostname.endsWith('.example'),
};
await writeFile(join(dist, 'seo-report.json'), JSON.stringify(buildReport, null, 2) + '\n', 'utf8');
const sw = await generateSW({
  globDirectory: dist,
  globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
  globIgnores: [
    'sw.js',
    'workbox-*.js',
    '**/*.map',
    '404.html',
    ...privateRoots.map((path) => `${path.slice(1)}/**`),
  ],
  swDest: join(dist, 'sw.js'),
  maximumFileSizeToCacheInBytes: 5000000,
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [
    /^\/api(?:\/|$)/,
    /^\/share(?:\/|$)/,
    /^\/auth(?:\/|$)/,
    /^\/login(?:\/|$)/,
    /^\/account(?:\/|$)/,
    /^\/projects(?:\/|$)/,
    /^\/assistant(?:\/|$)/,
  ],
  cleanupOutdatedCaches: true,
  runtimeCaching: [],
  clientsClaim: true,
  skipWaiting: false,
  mode: 'production',
});
for (const warning of sw.warnings) process.stderr.write(`Service worker warning: ${warning}\n`);
if (!buildReport.canonicalConfiguredForProduction)
  process.stderr.write(
    `SEO uses ${site}. Set VITE_SITE_URL to the production HTTPS origin and rebuild before publishing.\n`,
  );
process.stdout.write(
  JSON.stringify({ ...buildReport, precachedFiles: sw.count, precacheBytes: sw.size }, null, 2) +
    '\n',
);
