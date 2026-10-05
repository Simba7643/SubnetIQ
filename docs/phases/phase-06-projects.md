# Phase 6 supplement — Project workspaces and shared plans

## Delivered

The private workspace is available at `/projects`, with individual plans at `/projects/:id`. Anonymous snapshots are available at `/share/:token`. The three routes use the implemented project API and the ownership, history, and sharing guarantees described in [the security model](../security-model.md).

Accounts must be configured before private persistence is available. Guests see an accurate account prompt and can continue using calculators, templates, and exports. A calculation handed off from a calculator remains visible before sign-in. When the user follows the sign-in action, a temporary copy in the current tab preserves that calculation through authentication; it is cleared after saving or dismissing the handoff.

## Workspace behavior

| Workflow               | Implemented behavior                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project collection     | Create, open, filter loaded projects by name, notes or context, select active or archived projects, and load additional pages of 24 projects                                       |
| New project            | Review its name, project notes and address-space context; start blank, import JSON or CSV, or use a calculation or template                                                        |
| Calculation continuity | Create a project from an original calculation, or attach its inputs and result to an existing project with optional network allocations                                            |
| Project metadata       | Edit name, context, notes and archive status; save a copy or delete the project and its dependent records                                                                          |
| Allocations            | Create and edit IPv4, IPv6 or paired allocations with names, VLANs, gateways, purpose, notes, parent allocation, growth, capacity policy, provider variant, locks and reservations |
| Visual review          | Search allocation rows, inspect exact IPv4 and IPv6 allocation maps, and run the common engine's overlap and containment checks                                                    |
| Local editing          | Undo and redo up to 30 draft changes, retain the draft after save errors, explicitly reload the saved version, and warn before closing a tab with unsaved changes                  |
| Version history        | Automatically retain the previous saved state; name manual checkpoints; inspect metadata and allocation differences; restore a selected checkpoint as a new version                |
| Sharing                | Create a read-only snapshot with a lifetime of 1–90 days, copy the raw link when it is first created, inspect its expiry or revocation status, and revoke it                       |
| Shared view            | Read the immutable snapshot without signing in, inspect allocations and original calculations, export it, or save a private copy when signed in                                    |
| Exports                | Copy or download complete project JSON, download formula-safe allocation CSV, generate a PDF report, or print the current view                                                     |

Saved calculator attachments retain their original inputs and outputs. The view explains that manually changing an allocation does not recompute an older attachment. A saved calculation can reopen its original inputs in the appropriate calculator when its link fits the supported URL size.

## Addressing and import rules

Network rows use the shared exact-integer calculation library. Validation canonicalizes prefixes, checks gateways against the row's networks, restricts VLANs to 1–4094, and requires a parent to strictly contain its child in the same address family. This strict containment also prevents parent cycles. IPv4/IPv6 pairs require one network of each family. CIDR changes recompute derived boundaries, size, and usable capacity, preserving the selected cloud policy and provider variant.

The allocation editor requires a locked network to be explicitly unlocked before its CIDR can be edited, and prevents removing it while locked. Locks are planning controls; the owner can still deliberately change the full plan through the JSON editor. Growth is stored as a planning preference, with an explanation that applying a new growth allowance requires rerunning the planner.

The JSON importer accepts an exported project, a project object, a plan object, or a complete calculation result. An imported project receives a new server-owned identity when created; its old owner, ID and version do not become request fields. CSV supports quoted commas, multiline notes, escaped quotes, UTF-8 BOMs, and common CIDR/IPv4/IPv6 column names. Invalid quoting, duplicate headings, malformed numbers and invalid boolean settings produce useful errors.

Inside an existing project, an import opens a review dialog before modifying the draft. The user can replace the allocation list or complete plan, or append allocations and calculations. Appended allocations receive fresh identifiers, with imported parent relationships remapped consistently. Using imported project metadata is a separate explicit choice. Changes remain unsaved until the normal versioned save succeeds.

The plan JSON editor also requires explicit validation and application before saving. Invalid JSON or a non-object plan leaves the previous draft intact. Exports identify unsaved drafts, and PDF reports identify the saved version on which those drafts are based.

## Persistence, revisions and sharing

Project saves include the version loaded by the editor. The API calls the database's atomic mutation function, which checks ownership and the expected version before recording the old snapshot and committing a new version. A stale save is rejected and the browser retains the local draft for review or export. The user can reload the latest saved version explicitly.

Named checkpoints and share links operate on the saved version; the interface asks the user to save pending changes first. Restoring a revision includes the current expected version, and keeps the displaced saved state in history. Revision browsing expands from 25 to the API's latest-200 limit. The share list likewise covers its most recent 200 records and labels that boundary.

Only the hash of a share token is stored. The owner receives its raw URL once when creating the link. Resolution returns the stored immutable snapshot only while the share is active; unknown, expired and revoked links have the same unavailable response. The shared page refreshes access every 60 seconds, uses the API's no-store behavior, and removes the displayed snapshot when a subsequent access check fails. Revocation cannot recall a copy or export that a viewer already obtained.

## Practical boundaries

- A plan is limited to 2 MiB of encoded JSON and 1,000 network rows. Project POST/PATCH requests have a matching 2.25 MiB HTTP envelope limit.
- Import files are limited to 2.2 MB and are validated before they affect a draft.
- Allocation tables display 50 rows per page, with explicit navigation and matching-row counts.
- Project filters operate on loaded pages. The interface names that scope and offers Load more when another page may be available.
- Conflict checks are within the project's address-space context. Parent/child containment may be intentional and is called out for review.
- Draft undo history and the authentication handoff belong to the current browser tab. Durable ownership and version history begin when a server save succeeds.

## Verification

`pnpm exec vitest run --project web apps/web/src/features/projects` completed with **27 passing tests** at this checkpoint. The 18 model cases use the real network engine and cover CSV syntax and round trips, canonical CIDRs, paired-family and gateway validation, parent containment, fresh derived geometry, AWS capacity, standalone calculation imports, invalid project data, formula-safe CSV, exact IPv6 map counts, and semantic revision comparison.

The nine interaction cases exercise the real page and shared UI components with controlled API responses: an unconfigured guest, project creation without owner or version fields, versioned updates, preservation after a stale-save rejection, explicit JSON validation, share creation and revocation, versioned restoration, anonymous invalid-link handling, and a private copy of a shared snapshot.

Targeted ESLint and the complete web TypeScript check passed. Database ownership and snapshot behavior have a separate **108-assertion PostgreSQL WASM test suite**, described in [Phase 3](phase-03.md). These browser-component tests do not substitute for a deployed Supabase Auth/API/Storage exercise. Native Supabase integration and deployment gates are recorded separately in the release verification documentation.

## Main files

- `apps/web/src/pages/ProjectsPage.tsx`
- `apps/web/src/pages/ProjectPage.tsx`
- `apps/web/src/pages/SharedProjectPage.tsx`
- `apps/web/src/features/projects/ProjectViews.tsx`
- `apps/web/src/features/projects/model.ts`
- The adjacent model and page interaction tests

The calculator and visualizer part of this phase is documented in [Phase 6](phase-06.md).
