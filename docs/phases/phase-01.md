# Phase 1 — Monorepo, contracts, and tooling

## Delivered

The workspace contains `apps/web`, `apps/api`, `packages/shared`, and `packages/netcalc`, with a pinned pnpm package-manager version and a committed dependency lockfile. React remains version 18.3.1 as requested. Node 24 is the documented runtime, TypeScript is strict, and package compilation separates browser presentation from reusable network arithmetic and server transports.

Root manifests provide development, build, type checking, linting, formatting, unit/API/browser/database tests, data validation, and release packaging commands. Required ignore/line-ending/editor/runtime configuration is included. Environment examples contain no inline comments; the environment reference explains every field separately.

The legacy `.eslintrc` requirement is preserved and actively loaded through ESLint’s FlatCompat bridge. Prettier, Husky, lint-staged, and GitHub Actions provide local and repository validation. All written source/configuration files follow the no-code-comments instruction.

## Shared contract

`packages/shared/src/index.ts` defines calculation results, exact-count string transport, explanation steps, allocation blocks, project/conversation/quiz/glossary types, and Zod request schemas. `practice.ts` supplies deterministic questions whose stable identifiers can be regenerated and graded by the server. The implementation contract records public entry points and API shapes.

## Verification

The release-wide installation, type-check, formatting, lint, and build outcomes are recorded in `../verification.md`. Tool versions are resolved in `pnpm-lock.yaml`; no dependency directory is needed in the source ZIP.
