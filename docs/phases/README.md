# SubnetIQ phase guide

**The complete runnable project is the repository root.** The phase documents explain how the final implementation addresses the requested scope and identify relevant code, evidence, and remaining configuration requirements.

The separate `SubnetIQ-phases.zip` groups the final source files by responsibility. Its folders are **not historical checkpoints and are not independently runnable applications**. Each original source file appears exactly once in that archive. All phases must be combined to satisfy shared imports and configuration dependencies.

## Navigate the delivery

| Phase | Guide                                          | Scope and principal source locations                                                                                                                   |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | [Research and architecture](phase-00.md)       | Product direction, competitor research, feature scope, architecture, and the [original research PDF](phase-00-research.pdf)                            |
| 1     | [Workspace and tooling](phase-01.md)           | Workspace manifests, lockfile, TypeScript and lint configuration, environment template, `packages/shared` contracts, and registered dependency patches |
| 2     | [Networking engine](phase-02.md)               | `packages/netcalc`, independent fixtures, edge-case tests, special-address registries and provider capacity profiles                                   |
| 3     | [Database and access control](phase-03.md)     | Supabase schema, migrations, RLS, triggers, service functions, Storage policy, SQL verification, and seed data                                         |
| 4     | [Backend API](phase-04.md)                     | Express routes, authentication, protected lookups, cache and quota controls, project APIs, authoritative quiz grading, and AI provider infrastructure  |
| 5     | [Frontend foundation](phase-05.md)             | Application shell, React Router, authentication, design system, themes, internationalization structure, and shared result controls                     |
| 6     | [Calculators and workspaces](phase-06.md)      | IPv4/IPv6 calculator interfaces, planners, bit and allocation visualizers, project editing, revisions, and read-only sharing                           |
| 7     | [Learning and practice](phase-07.md)           | Twelve modules, glossary, curated and generated practice, timers and streaks, account history, weak-topic analysis, and printable references           |
| 8     | [Networking and cyber toolkit](phase-08.md)    | Protocol and port references, live lookups, firewall helpers, local password/hash tools, threat and CVSS cards, command library, and network templates |
| 9     | [Assistant](phase-09.md)                       | Full-page and floating assistant, streaming, calculation context, suggestions, stop/retry behavior, markdown, and conversation history                 |
| 10    | [Public product and distribution](phase-10.md) | Landing page, original articles, SEO and prerendering, PWA, public assets, analytics consent, and public information pages                             |
| 11    | [Deployment and release](phase-11.md)          | Docker, Vercel/Render configuration, CI, integration tests, setup documentation, and complete verified ZIP packaging                                   |

## Verification and configuration boundaries

The [final verification record](../verification.md) is the authoritative account of checks actually executed, their results, and checks requiring external services or unavailable runtimes. Individual phase documents supply more specific evidence. A target such as Lighthouse 90+ or WCAG 2.1 AA should not be interpreted as a measurement unless the verification record includes that result.

The [environment reference](../environment.md) explains every supplied variable. The [deployment guide](../deployment.md) covers local execution, hosted Supabase, containers, Vercel, and Render. Live OAuth, email delivery, database/Storage, public hosting, and AI use the operator's chosen accounts and credentials. Environment examples contain placeholders rather than private credentials. The registered `patches/` directory is included with the workspace and lockfile so dependency installation applies the production-build compatibility patch.

## Complete source archive

`SubnetIQ-source.zip` contains the final source tree under `subnetiq/`, including all application and package code, tests, static datasets, course and article content, deployment configuration, phase guides, research PDF, and verification documentation. Installed dependencies, build products, transient caches, private environment files, private-key files, and test-run output are excluded.

After extraction, follow the root [README](../../README.md). Install and run from the complete project root, not an individual phase directory.

## Phase archive and reconstruction

`SubnetIQ-phases.zip` contains `subnetiq-phases/phase-00/` through `phase-11/`. Each phase includes a generated `PHASE-GUIDE.md` and its final files with original relative paths intact. Feature-specific tests remain with their owning feature; cross-application tests and release checks are assigned to Phase 11. Backend provider infrastructure stays in Phase 4, while the assistant's frontend and shared streaming UI belong to Phase 9.

The archive includes `REASSEMBLE.py`, requiring only Python 3.9 or newer:

```bash
python3 REASSEMBLE.py --verify-only
python3 REASSEMBLE.py --output ../subnetiq
```

On Windows:

```powershell
py -3 REASSEMBLE.py --verify-only
py -3 REASSEMBLE.py --output ..\subnetiq
```

The helper verifies every original file's size and SHA-256 before writing. It refuses to overwrite a populated destination. Reconstruction produces the same source tree as the complete source archive, without generated archive-only navigation files.

## Build the archives again

From the complete project root:

```bash
python3 scripts/test-package-release.py
python3 scripts/package-release.py --check
pnpm package:release
```

The packaging tests use isolated temporary fixtures to check file parity, checksum accuracy, private-environment exclusion, reconstruction, reproducibility, missing-file refusal, and repackaging an extracted source archive. They do not create or replace a project release.

The script uses only Python's standard library and creates:

- `release/SubnetIQ-source.zip`
- `release/SubnetIQ-phases.zip`
- `release/SHA256SUMS`

It refuses incomplete releases, validates required phase guides and entrypoints, rejects unsafe paths and symbolic links, excludes private environment files, checks environment examples for non-placeholder credentials, validates registered dependency patch files, ensures the source has not changed during packaging, and verifies the generated ZIP contents before publishing the files into the output folder.

Every archive includes `MANIFEST.json` with the source path, archive path, phase, byte size, SHA-256, and executable mode of each original file. Generated navigation and reconstruction helpers are listed separately. The manifest does not hash itself; the external checksum file covers the complete archives, including their manifests.

When rebuilding from an extracted source archive, the packager recognizes and regenerates its root `MANIFEST.json`. This generated archive metadata is not counted as an original source file.

Verify downloaded archives from the directory containing all three release files:

```bash
sha256sum -c SHA256SUMS
```

On Windows, compare the values from `Get-FileHash .\SubnetIQ-source.zip -Algorithm SHA256` and `Get-FileHash .\SubnetIQ-phases.zip -Algorithm SHA256` with `SHA256SUMS`. Archive integrity confirms that the bytes match the provided release; it does not independently certify application correctness or deployment configuration.
