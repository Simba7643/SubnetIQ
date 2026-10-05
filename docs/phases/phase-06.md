# Phase 6 — Calculators, visualizers, and planning workflows

## Delivered

The tool collection contains all 20 calculation interfaces, with working examples, category filters, task and protocol search, input validation, and live results. Every form calls the same synchronous network engine used by the API. Invalid values replace the result with a useful explanation; an older result is not presented as the answer to an invalid input.

The collection is available at `/tools`; each calculation is at `/tools/:toolId`. `toolDefinitions.ts` supplies the landing page, collection, related tools, and command palette with one consistent catalog.

| Area                   | Implemented controls and behavior                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IPv4 subnetting        | Address/prefix entry, conventional/point-to-point/cloud capacity policies, AWS BYOIP and Google Cloud secondary variants, optional parent CIDR, adjacent-subnet navigation, and an interactive 32-bit editor |
| Equal subnet splitting | Whole-network power-of-two splitting or explicit-prefix allocation, exact large counts, and a paged 256-row preview                                                                                          |
| VLSM                   | Named segments, required hosts, growth percentages, inherited or per-segment policies, provider variants, locked CIDRs, reserved ranges, and add/remove controls                                             |
| Range tools            | Exact aggregation, covering summaries, range-to-CIDR conversion, CIDR-to-range conversion, overlaps, containment, and duplicate checks                                                                       |
| Address interpretation | Wildcard/ACL inputs, integer and dotted-octet base conversion, classification, reverse DNS, and filtered netmask tables                                                                                      |
| IPv6                   | Subnet and canonical-format tools, interactive hextet/prefix views, modified EUI-64, large-index prefix planning, and reserved-prefix availability                                                           |
| Address mapping        | IPv4-mapped, NAT64, and historical 6to4 encoding/decoding; switching direction retains the converted address when the current input is valid                                                                 |
| Capacity and MAC       | Transfer units and efficiency, MTU/MSS and actual packet-data budgets, IP/TCP options and IPv6 extension headers, and MAC address inspection                                                                 |

## Visual planning

IPv4 and IPv6 allocation maps use the engine’s parsed integer ranges to position blocks proportionally. Users can switch between the whole parent network and the span of the displayed allocations, select a block by pointer or keyboard, and inspect its exact boundaries and count.

VLSM reservations use the engine’s merged physical ranges. They are not duplicated when adjacent reservations combine. For IPv6, an overlap makes a complete child prefix unavailable, while the result separately reports the physically reserved address count. This distinction is visible in the map, rows, and explanation.

Large plans expose preview limits and stable, zero-based navigation. Tabular exports contain the displayed rows; compact result data preserves the complete mathematical description and totals.

## Result continuity

Every valid result uses the shared `ResultPanel` for copy, calculation URLs, print, CSV, JSON, PDF, explanations, project handoff, and assistant context. Calculation URLs restore normalized inputs, including advanced provider variants, reservations, large indices, options, and conversion direction.

Authenticated users save through `POST /api/saved-calculations`; the server recomputes the result from the supplied inputs. Failures are reported without claiming persistence. Guest calculations remain in the current interface, and project/assistant handoffs use router state. The interface explains how to enable accounts when the deployment has no Supabase configuration.

## Accessibility and presentation

Inputs have associated labels and descriptive hints. The bit editor, prefix sliders, allocation selectors, preview navigation, advanced controls, and example buttons have keyboard-operable semantics. Address entry and address visualizations keep left-to-right numeric order inside an Arabic interface. Colors adapt to the light and dark themes, and reduced-motion preferences are honored.

The desktop view pairs inputs with results. Narrow layouts move the result below the input form; the Calculate action moves focus to the result region. Visual labs can be expanded independently from the common result and explanation controls.

## Verification

`pnpm exec vitest run --project web apps/web/src/features/calculators` completed with **68 passing tests** at this checkpoint. The tests use the real calculation engine and verify every default tool, shared-input round trips, advanced inputs, invalid-value recovery, interactive bit changes, provider variants, locked VLSM allocations, merged reservations, IPv6 pagination and partial reservations, mapping direction, MTU/MSS distinctions, authenticated saving, persistence errors, and guest project handoffs.

`pnpm exec eslint apps/web/src/features/calculators` passed. TypeScript checks passed for the assembled frontend at the Phase 6 checkpoint. Browser workflows, accessibility scans, screenshots, and production offline checks are supplied as runnable Playwright gates. Chromium exited during startup in this workspace before a page could be created, so those browser checks are not recorded as passing. See `tests/e2e/README.md`, `docs/testing.md`, and `docs/verification/browser-launch.json` for the commands, measured results, and remaining browser verification.

## Main files

- `apps/web/src/features/calculators/ToolsPage.tsx`
- `apps/web/src/features/calculators/ToolPage.tsx`
- `apps/web/src/features/calculators/ToolInputs.tsx`
- `apps/web/src/features/calculators/Visualizers.tsx`
- `apps/web/src/features/calculators/toolDefinitions.ts`
- `apps/web/src/features/calculators/inputModel.ts`
- `apps/web/src/features/calculators/calculators.css`
- The adjacent input-contract and interaction test files
