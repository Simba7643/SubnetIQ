# Integration contract

The root owns package manifests, build/tooling configuration, shared types, app shell, shared UI, auth, projects, assistant, deployment and release documentation. Bounded implementation owners must not change other owners' files without coordination.

## Shared math

Import calculate from @subnetiq/netcalc and CalculationResult, ToolId, SegmentInput from @subnetiq/shared. calculate(toolId, input: Record<string, unknown>): CalculationResult is synchronous and throws a useful Error for invalid input. The result contract is in packages/shared/src/index.ts. Math owners may add exports but preserve these types.

Input shapes:

- ipv4-subnet: address (CIDR string), policy (lan, point-to-point, aws, azure, gcp)
- ipv4-split: network, count (number), optional prefix
- vlsm: network, segments (name, hosts, growthPercent, lockedCidr, policy), reserved (CIDR strings), policy
- aggregate: networks (string array), mode (exact or cover)
- range-to-cidr: start, end
- cidr-to-range: network
- overlap: networks (string array)
- wildcard: address (IP or CIDR), optional mask (wildcard string)
- convert: value (string), fromBase (2,8,10,16), toBase (2,8,10,16)
- classify: address (IP or CIDR)
- reverse-dns: address (IP or CIDR)
- netmask-table: min (0), max (32), policy
- ipv6-subnet: address (CIDR string)
- ipv6-format: address
- eui64: mac, prefix (fe80::/64)
- ipv6-plan: network, prefix (64), count (16), startIndex (decimal string, optional)
- ipv4-map: address (IPv4), mode (mapped, nat64, 6to4), prefix (64:ff9b::/96)
- bandwidth: size, sizeUnit (B,KB,MB,GB,TB,KiB,MiB,GiB), speed, speedUnit (bps,Kbps,Mbps,Gbps), efficiency (percentage)
- mtu: mtu, ipVersion (4 or 6), tcpOptions, encapsulation
- mac: address

## Frontend

Use react-router-dom. Root provides CSS classes and src/components/ui.tsx: Button (variant primary/secondary/ghost/danger), Card, Field (label, hint, children), Input, Select, Textarea, Badge, EmptyState, PageHeader (eyebrow?, title, description?, actions?), Tabs (Radix wrapper is available if desired). Native semantic elements with classes are fine. Root provides ResultPanel at src/components/ResultPanel.tsx accepting result: CalculationResult and optional onSave callback. Root provides useAuth in src/lib/auth.tsx with user, configured, loading; api<T>(path, options?) in src/lib/api.ts; and notify(message, kind?) in src/lib/notify.ts. Use import aliases @/ for src.

CSS classes include page, page-header, eyebrow, muted, grid-2, grid-3, card, card-header, stack, row, field, input, textarea, select, button, button-primary, button-secondary, button-ghost, button-danger, badge, table-wrap, data-table, tabs, tab, active, code-block, error-banner, success-banner, tool-card, stat, stat-label, stat-value, section, prose, icon-box, empty-state. Theme uses dark navy/teal, rounded 12-16px surfaces, generous whitespace, 16px body, monospace values. Responsive by default. Icons lucide-react, motion framer-motion, dialogs @radix-ui/react-dialog.

Exports to provide:

- calculator UI owner: apps/web/src/features/calculators/ToolsPage.tsx default, ToolPage.tsx default (reads :toolId route param); optional planner components in same directory. Routes /tools and /tools/:toolId. Tool definitions owned in this directory.
- learning owner: apps/web/src/features/learning/LearnPage.tsx, GlossaryPage.tsx, PracticePage.tsx, LessonPage.tsx, CheatsheetsPage.tsx default exports. Routes /learn, /learn/:lessonId, /glossary, /practice, /cheatsheets.
- toolkit owner: apps/web/src/features/toolkit/ToolkitPage.tsx default (optional :section param), NetworkTemplatesPage.tsx default. Routes /toolkit, /toolkit/:section, /templates.

## API

Root expects createApp exported from apps/api/src/app.ts and src/server.ts runnable. API prefix /api. JSON success values are returned directly; failures use shared ApiErrorBody. Root api<T> throws message on failures. All normal user operations require a verified Supabase bearer token and retain RLS context. Without configured Supabase, guest calculator/lookup/mock AI work; protected operations return SERVICE_UNAVAILABLE with a helpful setup message, never fake saved data.

- GET /api/health and /api/ready
- POST /api/calculate/:tool body is input directly
- GET/POST /api/projects; PATCH/DELETE /api/projects/:id; GET /api/projects/:id
- GET/POST /api/projects/:id/revisions; POST /api/projects/:id/restore body revisionId
- POST /api/projects/:id/shares body expiresInDays (1-90); GET /api/projects/:id/shares; DELETE /api/shares/:id
- GET /api/share/:token returns project snapshot
- GET/POST /api/saved-calculations; DELETE /api/saved-calculations/:id
- POST /api/lookups/dns body name and type
- POST /api/lookups/ip-info body address
- GET /api/ai/status returns configured, provider, mode; POST /api/ai/chat streams SSE data JSON {type: 'meta'|'delta'|'done'|'error', content?, conversationId?, provider?, mode?, message?}; [DONE] may also be accepted
- GET/POST /api/ai/conversations; GET/DELETE /api/ai/conversations/:id; GET /api/ai/conversations/:id/messages
- GET/POST /api/favorites; DELETE /api/favorites/:id
- POST /api/quiz-attempts body questionId, answerIndex, topic, difficulty, durationMs, seed?; GET /api/practice/stats
- POST /api/feedback body message and optional email
- GET /api/account/export; DELETE /api/account

## Database collaboration

API and database owners must coordinate exact schema. Shared Project fields should match projects table. Prefer separate append-only project_revisions with snapshot JSON. project_shares stores token_hash, snapshot JSON, expires_at, revoked_at, owner_id, project_id. All user tables owner_id except profiles (id). Atomic rate function and lookup cache live in private schema or restricted RPC functions. Add complete local test SQL even if Docker unavailable here. No code comments, including SQL comments.

## Data

Learning owner owns data/glossary.json, quiz-bank.json, courses.json, ports.json, protocols.json, oui-subset.json, rfc-index.json, network-templates.json, threats.json, commands.json, cvss.json, sources.json and content/**/*.md. Netcalc owns data/special-ipv4.json, special-ipv6.json, cloud-profiles.json. Every data file is a JSON array unless a documented reason needs a wrapper. Glossary and quiz shapes use shared interfaces. Course shape: id,title,description,category,readingMinutes,content (markdown), objectives:string[]. All related glossary IDs must resolve.

## Deliverable rules

Complete working code only; no comments in source/config files; no TODO stubs except explicitly permitted unconfigured AI providers. All tool inputs must validate and fail with helpful messages. No fake authentication or pretend persistence. Tests and status must state what was actually run. Update docs/phases/phase-NN.md with your owned changes and tests when finished. Work under /workspace/scratch/5570d1970d7e/subnetiq only. Do not initialize Sites or publish; this is a source ZIP for the explicitly requested Vercel/Render stack.
