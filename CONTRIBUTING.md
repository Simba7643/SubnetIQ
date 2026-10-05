# Contributing

Start with the README and the implementation contract. Keep network arithmetic in `packages/netcalc`, shared wire types in `packages/shared`, and UI presentation in `apps/web`. Server-only credentials and upstream transports belong in `apps/api`.

## A useful change

Describe the user-visible problem, the intended behavior, and an example input/output. Preserve exact address arithmetic and JSON decimal-string counts. A bug fix should include a regression case that would have failed before the change; avoid tests that only mirror the implementation. For mathematical changes, compare against an independent oracle or property whenever possible.

Source files in this project intentionally contain no comments. Explain important design choices in documentation and clear names. Do not introduce unfinished code placeholders. Existing explicitly unavailable provider adapters must remain honestly labeled until implemented and tested.

## Local workflow

1. Install dependencies with the frozen lockfile.
2. Make the smallest coherent change within the relevant package.
3. Run focused tests while iterating.
4. Run type checks, lint, formatting, data checks, and the relevant integration gate.
5. Update phase/feature documentation and the changelog if behavior changes.
6. Open a review that explains why the change is needed and how it was verified.

Husky and lint-staged format/check staged code. GitHub Actions performs the broader gates. Do not commit `.env` files, tokens, generated browser caches, or private user data. A source release should be reproducible from the manifest and lockfile.

## Data and content changes

Retain primary-source attribution, reviewed dates, schema shape, stable IDs, and license notices. Glossary related IDs must resolve. Quiz choices must be unique, the correct index valid, and explanations substantive. Changes to the question bank must remain compatible with server-side grading or be versioned deliberately. Provider reservations and protocol registries can change; update the source and tests together.

## Database changes

Add a new timestamped migration. Do not rewrite already deployed migrations. Review ownership RLS, cross-owner foreign-key references, service-role privileges, function search paths, storage paths, and transactional behavior. Run the WASM SQL suite and then the native Supabase gate for release-sensitive database changes.

## Security changes

Use the private reporting process in SECURITY.md for vulnerabilities. A public issue or pull request must not include secrets, live exploitation instructions against an unrelated system, or another user’s data.
