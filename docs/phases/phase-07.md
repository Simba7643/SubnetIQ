# Phase 7 — Learning, practice, and reference content

## Delivered

The learning hub is implemented in `apps/web/src/features/learning`, with routed pages for the complete learning path, individual lessons, searchable glossary, practice, and printable cheat sheets. The interface uses the shared design system, accessible native form controls, React Router, TanStack Query, and responsive scoped styles.

| Content                    | Delivered count | Location                                                                                                            |
| -------------------------- | --------------: | ------------------------------------------------------------------------------------------------------------------- |
| Original glossary entries  |             302 | `data/glossary.json`                                                                                                |
| Categories                 |               5 | Addressing, Routing, Switching, Security, Protocols                                                                 |
| Complete course modules    |              12 | `data/courses.json`, `content/courses/*.md`                                                                         |
| Course prose and examples  |     5,060 words | Minimum 377 words per module before Markdown formatting                                                             |
| Original curated questions |             185 | `data/quiz-bank.json`                                                                                               |
| Question topics            |              13 | Addressing, binary, CIDR, DHCP, DNS, IPv6, protocols, routing, security, subnetting, summarization, switching, VLSM |
| Practice difficulty modes  |               4 | Beginner, intermediate, advanced, exam                                                                              |
| Printable reference sheets |               5 | `content/cheatsheets/*.md` and `/cheatsheets`                                                                       |

Each glossary entry contains a definition, practical example, category, and three resolvable related-term IDs. Search matches terms, definitions, and examples. Category filters, bounded loading, direct term URLs, and URL-synchronized search queries preserve usable navigation through the collection.

Each course contains objectives, complete explanations, worked examples, practice answers, and primary-source references. The path covers IP basics, binary mathematics, historical classes, CIDR, subnetting, VLSM, summarization, IPv6, NAT, DHCP, DNS, and routing. Lesson review checkboxes are explicitly labeled as lasting for the current visit. An interactive keyboard-operable octet toggler demonstrates bit weights and sends the resulting address into the calculator. The calculator suite additionally provides prefix and address-space visualizations.

## Practice behavior

The original curated bank combines carefully selected mathematical fixtures with conceptual and operational questions. Every answer has an explanation, and every question has four distinct options and a stable ID. The mathematics fixtures were produced and cross-checked using Python's independent `ipaddress` implementation and exact integer arithmetic.

`packages/shared/src/practice.ts` exports the deterministic `generatePracticeQuestion` and `fromGeneratedId` functions. The API and frontend use the same seed/position contract, allowing the server to reproduce and grade a generated answer rather than trust client-submitted correctness. Canonical IDs include difficulty, an unsigned 32-bit seed, and a bounded question index.

Sessions support selected topics, curated or generated sources, 5/10/20/40 question requests, reproducible seeds, optional shared countdown budgets, and elapsed time. Exam mode uses an explicit shared budget of 90 seconds per actual question and original CCNA-style material, without certification affiliation. Curated sessions use available matches without repeating IDs. Generated focused sessions search a bounded deterministic sequence.

Submitted answers lock, show the explanation, and link to a relevant lesson. Score, accuracy, current streak, best streak, duration, and a final exportable report are available. Timer expiry counts unanswered questions in the session total without manufacturing graded backend attempts.

Guest answers remain in memory for the current visit. Signed-in answers use the protected quiz API; pending, successful, and failed saves are shown honestly. Users can retry a failed save. Account statistics and paginated attempt history are fetched through the API with owner-scoped authentication. Session state clears on account changes. No passwords, tokens, or private quiz history are written to local storage by this feature.

Weak-topic analysis combines saved topic rows and ranks accuracy from lowest to highest, labels small samples, reports average answer duration, and links to review lessons. Guest sessions receive the same analysis on their current answers only.

## Printable and reusable reference

The cheat-sheet page offers CIDR/mask tables with validated prefix bounds and explicit capacity profiles, exact powers of two, private and selected special ranges, common ports with security notes, and OSI/TCP-IP mappings. It uses the common ResultPanel for copy, share, print, CSV, JSON, and PDF exports. Static Markdown versions are included for offline reference.

The broader toolkit content delivered with this phase contains:

- 49 port/transport entries with service and security notes.
- 22 protocol descriptions with purposes and primary references.
- A clearly limited ten-entry OUI/vendor subset, not a complete vendor database.
- 12 threat cards with indicators and defensive measures.
- 16 command references with syntax, examples, platform, and cautions.
- 16 CVSS/vulnerability learning cards, including 12 CVSS 4.0 concepts.
- Four complete sample address plans: home, small business, campus, and data center.
- 24 RFC references and 28 provenance records.

The toolkit UI is documented separately in Phase 8. Blog authoring and the article manifest belong to Phase 10.

## Verification performed

The focused verification command passes **16 tests across three files**:

```bash
pnpm exec vitest run packages/shared/src/practice.test.ts apps/web/src/features/learning/model.test.ts apps/web/src/features/learning/Learning.test.tsx
```

Verification covers 800 generated question round-trips across all four levels and boundary seeds; rejection of malformed or out-of-range IDs; independent binary/host-count checks; curated-bank integrity; all glossary relationships; substantive module content; reproducible focused sessions; streak reset and weak-topic ordering; accessible octet interactions; glossary navigation and query changes without remounting; answer locking and explanations; guest-local behavior; timer expiry without fabricated submissions; and signed-out history guidance.

Scoped ESLint passes for the learning feature and shared practice generator/tests. The learning source and data were formatted with Prettier. Four focused browser workflows in `tests/e2e/learning.spec.ts` cover the binary lesson and calculator handoff, reproducible practice and answer locking, glossary query and related navigation, and cheat-sheet controls. The browser file passes its TypeScript and ESLint checks. The [integration verification record](../verification.md) documents executed browser checks and the complete application typecheck.

Live Supabase account persistence requires the configured service and user authentication. This phase does not claim a live production account test or measured accessibility/Lighthouse certification.
