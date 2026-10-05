import argparse
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PHASE_NAMES = {
    0: 'Research, feature scope, and architecture',
    1: 'Monorepo, shared contracts, and development tooling',
    2: 'Pure networking engine and calculation verification',
    3: 'Supabase schema, ownership, and database policies',
    4: 'Backend API, protected lookups, and provider infrastructure',
    5: 'Frontend foundation, authentication, and design system',
    6: 'Calculators, planners, and project workspaces',
    7: 'Learning, practice, glossary, and cheat sheets',
    8: 'Networking and cybersecurity toolkit',
    9: 'Assistant interface and streaming integration',
    10: 'Articles, SEO, PWA, analytics, and public information',
    11: 'Deployment, CI, integration verification, and release',
}

EXCLUDED_DIRECTORIES = {
    'node_modules', '.git', '.hg', '.svn', '.cache', '.turbo', '.vercel',
    '.supabase', 'dist', 'build', 'coverage', 'release', 'test-results',
    'playwright-report', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.ruff_cache', '.next', 'logs', 'tmp', 'temp', '.tmp', '.vscode',
}
EXCLUDED_FILENAMES = {
    '.DS_Store', 'Thumbs.db', '.netrc', '.envrc', '.npmrc.local', '.pnpm-store',
    'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'credentials.json',
    'service-account.json',
}
EXCLUDED_SUFFIXES = ('.tsbuildinfo', '.log', '.pyc', '.pyo', '.swp', '.swo', '.tmp', '.bak', '.pem', '.key', '.p12', '.pfx')
ROOT_PHASE_ONE = {
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
    'tsconfig.base.json', 'eslint.config.mjs', '.eslintrc', '.gitignore',
    '.gitattributes', '.editorconfig', '.nvmrc', '.prettierrc', '.prettierignore',
    '.env.example', 'lint-staged.config.mjs',
}
PHASE_SEVEN_DATA = {'courses.json', 'glossary.json', 'quiz-bank.json'}
PHASE_TWO_DATA = {'special-ipv4.json', 'special-ipv6.json', 'cloud-profiles.json'}
PHASE_EIGHT_DATA = {
    'ports.json', 'protocols.json', 'oui-subset.json', 'rfc-index.json',
    'network-templates.json', 'threats.json', 'commands.json', 'cvss.json', 'sources.json',
}
REQUIRED_FILES = {
    '.gitignore', '.gitattributes', '.editorconfig', '.nvmrc', '.prettierrc',
    '.eslintrc', '.env.example', '.dockerignore', '.github/workflows/ci.yml',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
    'eslint.config.mjs', 'README.md', 'LICENSE', 'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md', 'SECURITY.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    'docker-compose.yml', 'vercel.json', 'render.yaml', 'vitest.config.ts',
    'playwright.config.ts', 'apps/web/package.json', 'apps/api/package.json',
    'apps/web/.env.example', 'apps/api/.env.example', 'apps/web/tsconfig.json',
    'apps/api/tsconfig.json', 'apps/web/Dockerfile', 'apps/api/Dockerfile',
    'apps/web/index.html', 'apps/web/vite.config.ts', 'apps/web/src/main.tsx',
    'apps/web/src/App.tsx', 'apps/api/src/app.ts', 'apps/api/src/server.ts',
    'packages/netcalc/src/index.ts', 'packages/netcalc/package.json',
    'packages/shared/src/index.ts', 'packages/shared/src/practice.ts',
    'packages/shared/package.json', 'apps/web/src/features/calculators/ToolsPage.tsx',
    'apps/web/src/features/calculators/ToolPage.tsx',
    'apps/web/src/features/learning/LearnPage.tsx',
    'apps/web/src/features/learning/LessonPage.tsx',
    'apps/web/src/features/learning/GlossaryPage.tsx',
    'apps/web/src/features/learning/PracticePage.tsx',
    'apps/web/src/features/learning/CheatsheetsPage.tsx',
    'apps/web/src/features/toolkit/ToolkitPage.tsx',
    'apps/web/src/features/toolkit/NetworkTemplatesPage.tsx',
    'apps/web/src/pages/ProjectPage.tsx', 'apps/web/src/pages/SharedProjectPage.tsx',
    'apps/web/src/pages/AssistantPage.tsx', 'apps/web/src/components/AssistantWidget.tsx',
    'supabase/config.toml', 'supabase/seed.sql', 'supabase/tests/001_database.test.sql',
    'data/glossary.json', 'data/courses.json', 'data/quiz-bank.json',
    'data/ports.json', 'data/protocols.json', 'data/oui-subset.json',
    'data/network-templates.json', 'data/special-ipv4.json', 'data/special-ipv6.json',
    'data/cloud-profiles.json', 'data/rfc-index.json', 'data/articles.json',
    'data/threats.json', 'data/commands.json', 'data/cvss.json', 'data/sources.json',
    'docs/environment.md', 'docs/deployment.md', 'docs/security-model.md',
    'docs/verification.md', 'docs/api.openapi.yaml', 'docs/phases/README.md',
    'docs/phases/phase-00-research.pdf', 'scripts/package-release.py',
    'scripts/validate-data.mjs', 'scripts/generate-seo.mjs',
    'patches/@rollup__plugin-terser@1.0.0.patch',
} | {f'docs/phases/phase-{phase:02}.md' for phase in range(12)}


class ReleaseError(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_relative(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or '.' in path.parts:
        raise ReleaseError(f'Unsafe release path: {value!r}')
    if any(ord(char) < 32 for char in value) or '\\' in value or ':' in value:
        raise ReleaseError(f'Unsupported release path: {value!r}')
    return path


def private_environment(name):
    lower = name.lower()
    return (lower == '.env' or lower.startswith('.env.')) and lower != '.env.example'


def excluded_file(relative):
    path = safe_relative(relative)
    return (
        any(part in EXCLUDED_DIRECTORIES for part in path.parts[:-1])
        or path.name in EXCLUDED_FILENAMES
        or private_environment(path.name)
        or path.name.lower().endswith(EXCLUDED_SUFFIXES)
        or path.name.startswith('._')
    )


def phase_for(relative):
    path = safe_relative(relative)
    name = path.name
    guide = re.fullmatch(r'docs/phases/phase-(\d{2})(?:-[a-z0-9-]+)?\.(?:md|pdf)', relative)
    if guide:
        phase = int(guide.group(1))
        if phase in PHASE_NAMES:
            return phase
    if relative.startswith('patches/'):
        return 1
    if relative == 'docs/implementation-contract.md':
        return 1
    if relative.startswith('packages/netcalc/'):
        return 2
    if relative.startswith('supabase/'):
        return 3
    if relative in {'apps/api/Dockerfile', 'apps/web/Dockerfile', 'apps/web/nginx.conf'}:
        return 11
    if relative.startswith('apps/api/'):
        return 4
    if relative.startswith('packages/shared/src/practice'):
        return 7
    if relative.startswith('packages/shared/'):
        return 1
    if relative.startswith('data/'):
        if name in PHASE_TWO_DATA:
            return 2
        if name in PHASE_SEVEN_DATA:
            return 7
        if name in PHASE_EIGHT_DATA:
            return 8
        if name == 'articles.json':
            return 10
        return 11
    if relative.startswith(('content/courses/', 'content/cheatsheets/')):
        return 7
    if relative.startswith(('content/blog/', 'content/legal/', 'apps/web/public/')):
        return 10
    if relative.startswith('apps/web/src/features/calculators/') or relative.startswith('apps/web/src/features/projects/'):
        return 6
    if relative.startswith('apps/web/src/features/learning/'):
        return 7
    if relative.startswith('apps/web/src/features/toolkit/'):
        return 8
    if relative.startswith('apps/web/src/features/assistant/'):
        return 9
    if relative in {
        'apps/web/src/pages/ProjectsPage.tsx', 'apps/web/src/pages/ProjectPage.tsx',
        'apps/web/src/pages/SharedProjectPage.tsx',
    }:
        return 6
    if name.startswith('AssistantWidget') or relative == 'apps/web/src/pages/AssistantPage.tsx' or relative.startswith('apps/web/src/lib/stream.'):
        return 9
    if relative in {
        'apps/web/src/pages/BlogPage.tsx', 'apps/web/src/pages/ArticlePage.tsx',
        'apps/web/src/pages/LegalPage.tsx', 'apps/web/src/pages/AboutPage.tsx',
        'apps/web/src/pages/ContactPage.tsx', 'apps/web/src/pages/HomePage.tsx',
        'apps/web/src/components/Seo.tsx', 'apps/web/src/components/PwaStatus.tsx',
        'apps/web/src/components/AnalyticsConsent.tsx', 'apps/web/src/lib/analytics.ts',
        'apps/web/src/lib/articles.ts', 'apps/web/vite.config.ts', 'apps/web/index.html',
        'scripts/generate-seo.mjs',
    }:
        return 10
    if relative.startswith('tests/') or relative.startswith('.github/') or relative.startswith('docs/'):
        return 11
    if relative.startswith('apps/web/'):
        if '.test.' in name or name in {'test-setup.ts', 'vitest.config.ts', 'playwright.config.ts'}:
            return 11
        return 5
    if relative in ROOT_PHASE_ONE or relative.startswith('.husky/'):
        return 1
    return 11


def validate_example(path, data):
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError as error:
        raise ReleaseError(f'Environment example is not UTF-8: {path}') from error
    sensitive = re.compile(r'(?:^|_)(?:API_KEY|ANON_KEY|PUBLISHABLE_KEY|SERVICE_ROLE_KEY|PRIVATE_KEY|PASSWORD|SECRET|TOKEN)$')
    allowed_values = {'', 'changeme', 'change-me', 'replace-me', 'your-key-here', 'postgres'}
    for line_number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        if '=' not in stripped:
            raise ReleaseError(f'Invalid environment example assignment: {path}:{line_number}')
        key, value = stripped.split('=', 1)
        value = value.strip().strip('\"\'')
        if sensitive.search(key.strip().upper()) and value.lower() not in allowed_values:
            if not re.fullmatch(r'(?:replace|your|example|placeholder)[-_][A-Za-z0-9_-]+', value, re.IGNORECASE):
                raise ReleaseError(f'Non-placeholder credential in {path}:{line_number} ({key.strip()}); value withheld.')


def collect_paths(root, output=None):
    selected = []
    excluded_environments = []
    ignored_output = output.resolve() if output is not None else None
    for directory, directories, filenames in os.walk(root, followlinks=False):
        current = Path(directory)
        retained = []
        for name in sorted(directories):
            candidate = current / name
            if name in EXCLUDED_DIRECTORIES or (ignored_output is not None and candidate.resolve() == ignored_output):
                continue
            if candidate.is_symlink():
                raise ReleaseError(f'Source directory is a symbolic link: {candidate.relative_to(root).as_posix()}')
            retained.append(name)
        directories[:] = retained
        for name in sorted(filenames):
            candidate = current / name
            relative = candidate.relative_to(root).as_posix()
            if private_environment(name):
                excluded_environments.append(relative)
                continue
            if excluded_file(relative):
                continue
            if candidate.is_symlink():
                raise ReleaseError(f'Source file is a symbolic link: {relative}')
            if not candidate.is_file():
                raise ReleaseError(f'Source entry is not a regular file: {relative}')
            if relative == 'MANIFEST.json':
                try:
                    manifest = json.loads(candidate.read_text(encoding='utf-8'))
                except (ValueError, UnicodeDecodeError) as error:
                    raise ReleaseError('MANIFEST.json is reserved for generated release metadata.') from error
                if not isinstance(manifest, dict) or any(manifest.get(key) != value for key, value in {'version': 1, 'kind': 'source', 'source_root': 'subnetiq', 'archive_root': 'subnetiq'}.items()):
                    raise ReleaseError('MANIFEST.json is reserved for generated release metadata.')
                continue
            selected.append(relative)
    selected.sort()
    folded = {}
    for relative in selected:
        key = relative.casefold()
        if key in folded:
            raise ReleaseError(f'Cross-platform path collision: {folded[key]} and {relative}')
        folded[key] = relative
    return selected, sorted(excluded_environments)


def validate_required(root, selected):
    present = set(selected)
    missing = sorted(REQUIRED_FILES - present)
    if missing:
        raise ReleaseError('Required release files are missing:\n' + '\n'.join(f'  {path}' for path in missing))
    empty = sorted(path for path in REQUIRED_FILES if (root / path).stat().st_size == 0)
    if empty:
        raise ReleaseError('Required release files are empty:\n' + '\n'.join(f'  {path}' for path in empty))
    requirements = {
        'Supabase SQL migrations': sum(path.startswith('supabase/migrations/') and path.endswith('.sql') for path in selected) >= 1,
        'Twelve Markdown course modules': sum(path.startswith('content/courses/') and path.endswith('.md') for path in selected) >= 12,
        'Five Markdown articles': sum(path.startswith('content/blog/') and path.endswith('.md') for path in selected) >= 5,
        'Five Markdown cheat sheets': sum(path.startswith('content/cheatsheets/') and path.endswith('.md') for path in selected) >= 5,
        'Calculation tests': any(path.startswith('packages/netcalc/') and '.test.' in path for path in selected),
        'Backend tests': any(path.startswith('apps/api/') and ('.test.' in path or '.spec.' in path) for path in selected),
        'Browser workflow tests': any(path.startswith('tests/e2e/') and '.spec.' in path for path in selected),
    }
    unmet = [name for name, valid in requirements.items() if not valid]
    if unmet:
        raise ReleaseError('Required release groups are missing:\n' + '\n'.join(f'  {name}' for name in unmet))
    workspace = (root / 'pnpm-workspace.yaml').read_text(encoding='utf-8')
    patch_references = re.findall(r"patches/[^\s\"'#]+\.patch", workspace)
    required_patch = 'patches/@rollup__plugin-terser@1.0.0.patch'
    if 'patchedDependencies:' not in workspace or required_patch not in patch_references:
        raise ReleaseError('The required terser dependency patch is not registered in pnpm-workspace.yaml.')
    for patch_path in patch_references:
        safe_relative(patch_path)
        if patch_path not in present:
            raise ReleaseError(f'Registered dependency patch is missing: {patch_path}')
    if not (root / 'docs/phases/phase-00-research.pdf').read_bytes().startswith(b'%PDF-'):
        raise ReleaseError('The Phase 0 research file is not a PDF.')


def snapshot(root, selected):
    records = []
    total = 0
    for relative in selected:
        path = root / relative
        before = path.stat()
        data = path.read_bytes()
        after = path.stat()
        marker = (after.st_size, after.st_mtime_ns, after.st_mode)
        if (before.st_size, before.st_mtime_ns, before.st_mode) != marker:
            raise ReleaseError(f'Source changed while being read: {relative}')
        if len(data) != after.st_size:
            raise ReleaseError(f'Incomplete source read: {relative}')
        if path.name.lower() == '.env.example':
            validate_example(relative, data)
        total += len(data)
        if total > 512 * 1024 * 1024:
            raise ReleaseError('Source selection exceeds 512 MiB; inspect unintended artifacts before packaging.')
        mode = 0o755 if after.st_mode & stat.S_IXUSR else 0o644
        records.append({'source_path': relative, 'phase': phase_for(relative), 'size': len(data), 'sha256': digest(data), 'mode': oct(mode), '_data': data, '_marker': marker})
    return records


def stable_snapshot(root, records, output):
    current, _ = collect_paths(root, output)
    if current != [record['source_path'] for record in records]:
        raise ReleaseError('The source file set changed during packaging. Retry when all writes have finished.')
    for record in records:
        value = (root / record['source_path']).stat()
        if (value.st_size, value.st_mtime_ns, value.st_mode) != record['_marker']:
            raise ReleaseError(f'Source changed during packaging: {record["source_path"]}')


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')


def timestamp(records):
    epoch = os.environ.get('SOURCE_DATE_EPOCH')
    try:
        seconds = int(epoch) if epoch is not None else max(record['_marker'][1] // 1_000_000_000 for record in records)
        value = datetime.fromtimestamp(seconds, timezone.utc)
    except (ValueError, OverflowError, OSError) as error:
        raise ReleaseError('SOURCE_DATE_EPOCH must be a supported integer Unix timestamp.') from error
    if not 1980 <= value.year <= 2107:
        raise ReleaseError('Release timestamps must fall within ZIP-supported years 1980–2107.')
    return value


REASSEMBLE_SCRIPT = '''import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path, PurePosixPath


def main():
    parser = argparse.ArgumentParser(description="Verify and reconstruct the complete SubnetIQ source from all phase groups.")
    parser.add_argument("--output", type=Path, help="Destination folder; default is subnetiq beside this phase archive folder.")
    parser.add_argument("--verify-only", action="store_true", help="Verify every source hash without writing a destination.")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
    if manifest.get("kind") != "phases" or manifest.get("version") != 1:
        raise RuntimeError("This is not a supported phase manifest.")
    destination = (args.output or root.parent / "subnetiq").resolve()
    if not args.verify_only and destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise RuntimeError("The destination must be absent or an empty directory. Existing files are never overwritten.")
    paths = set()
    loaded = []
    for entry in manifest["files"]:
        relative = PurePosixPath(entry["source_path"])
        archive = PurePosixPath(entry["archive_path"])
        if relative.is_absolute() or ".." in relative.parts or not relative.parts or any(ord(c) < 32 for c in str(relative)):
            raise RuntimeError("Unsafe original path in manifest.")
        if "\\\\" in str(relative) or ":" in str(relative):
            raise RuntimeError("Unsupported original path in manifest.")
        if archive.is_absolute() or ".." in archive.parts or archive.parts[0] != manifest["archive_root"]:
            raise RuntimeError("Unsafe archive path in manifest.")
        key = str(relative).casefold()
        if key in paths:
            raise RuntimeError("Duplicate source path in manifest.")
        paths.add(key)
        source = root.joinpath(*archive.parts[1:])
        if source.is_symlink() or not source.resolve().is_relative_to(root):
            raise RuntimeError("Phase source escapes its extracted folder.")
        data = source.read_bytes()
        if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise RuntimeError("Source integrity check failed: " + str(relative))
        loaded.append((relative, data, int(entry["mode"], 8)))
    if len(loaded) != manifest["file_count"]:
        raise RuntimeError("Source count does not match the manifest.")
    if args.verify_only:
        print("Verified " + str(len(loaded)) + " source files. No files written.")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".subnetiq-reassemble-", dir=destination.parent))
    try:
        for relative, data, mode in loaded:
            target = staging.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            if os.name != "nt":
                target.chmod(mode)
        if destination.exists():
            destination.rmdir()
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print("Reconstructed " + str(len(loaded)) + " verified files in " + str(destination))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print("Reassembly failed: " + str(error), file=sys.stderr)
        sys.exit(1)
'''


def phase_readme(counts):
    lines = [
        '# SubnetIQ — complete source grouped by delivery phase',
        '',
        '**These folders group the final verified source by responsibility. They are not historical checkpoints and are not independently runnable applications.**',
        '',
        'Use `SubnetIQ-source.zip` for the straightforward complete project. This archive contains the same original source files exactly once, distributed across phase folders with original relative paths preserved.',
        '',
        '| Phase | Scope | Original files |',
        '|---|---|---:|',
    ]
    lines.extend(f'| [{phase:02}](phase-{phase:02}/PHASE-GUIDE.md) | {PHASE_NAMES[phase]} | {counts[phase]} |' for phase in range(12))
    lines.extend([
        '', '## Verify and reconstruct', '',
        'Python 3.9 or newer is sufficient; no third-party packages are needed.', '',
        '```bash', 'python3 REASSEMBLE.py --verify-only', 'python3 REASSEMBLE.py --output ../subnetiq', '```', '',
        'On Windows, use `py -3 REASSEMBLE.py --verify-only` and `py -3 REASSEMBLE.py --output ..\\subnetiq`.', '',
        'The destination must be absent or empty. Every original file is verified against its SHA-256 and byte count before reconstruction. The helper retains source paths and executable permissions where supported.', '',
        'After reconstruction, follow `subnetiq/README.md`. Run application commands from the reconstructed project root. All phase dependencies are satisfied only when the full source tree is present.', '',
        '## Manifest and integrity', '',
        '`MANIFEST.json` maps each original source path to one archive path and records phase, size, SHA-256, and file mode. Generated per-phase guides, this index, and the reassembly helper are listed separately as auxiliary files. The manifest does not hash itself; the external `SHA256SUMS` hashes the entire archive, including its manifest.', '',
        'Environment templates are included with placeholder credentials. Actual environment files, installed dependencies, caches, build outputs, test reports, private-key files, and nested release output are excluded.', '',
        'The project verification record is in `phase-11/docs/verification.md`. The original research PDF is in `phase-00/docs/phases/phase-00-research.pdf`.',
    ])
    return ('\n'.join(lines) + '\n').encode('utf-8')


def phase_guide(phase, records):
    files = [record for record in records if record['phase'] == phase]
    lines = [
        f'# Phase {phase:02} — {PHASE_NAMES[phase]}', '',
        'This folder contains the final source files assigned to this delivery phase. Original relative paths are preserved below this directory.', '',
        f'Read the [complete phase guide](docs/phases/phase-{phase:02}.md).', '',
        '**This is a grouping of final files, not an independent historical checkpoint.** Reconstruct all phases using `../REASSEMBLE.py`, or use the complete source archive, before installing or running the application.', '',
        f'Original files in this phase: **{len(files)}**. Cross-phase imports and shared configuration are intentional. The [archive index](../README.md) explains the whole project, and `../MANIFEST.json` provides hashes and exact source-to-phase mappings.', '',
        '## Included original files', '',
    ]
    lines.extend(f'- `{record["source_path"]}`' for record in files)
    return ('\n'.join(lines) + '\n').encode('utf-8')


def archive_content(kind, records, created):
    prefix = 'subnetiq' if kind == 'source' else 'subnetiq-phases'
    entries = []
    files = []
    for record in records:
        relative = record['source_path']
        target = f'{prefix}/{relative}' if kind == 'source' else f'{prefix}/phase-{record["phase"]:02}/{relative}'
        entry = {key: record[key] for key in ('source_path', 'phase', 'size', 'sha256', 'mode')}
        entry['archive_path'] = target
        files.append(entry)
        entries.append((target, record['_data'], int(record['mode'], 8)))
    auxiliary = []
    if kind == 'phases':
        counts = Counter(record['phase'] for record in records)
        generated = [(f'{prefix}/README.md', phase_readme(counts), 0o644), (f'{prefix}/REASSEMBLE.py', REASSEMBLE_SCRIPT.encode('utf-8'), 0o755)]
        generated.extend((f'{prefix}/phase-{phase:02}/PHASE-GUIDE.md', phase_guide(phase, records), 0o644) for phase in range(12))
        for path, data, mode in generated:
            auxiliary.append({'archive_path': path, 'size': len(data), 'sha256': digest(data), 'mode': oct(mode)})
            entries.append((path, data, mode))
    manifest = {
        'version': 1, 'kind': kind, 'created_at': created.isoformat().replace('+00:00', 'Z'),
        'source_root': 'subnetiq', 'archive_root': prefix, 'file_count': len(files),
        'total_source_bytes': sum(record['size'] for record in records),
        'phase_semantics': 'Final-file responsibility groups; not historical independently runnable checkpoints.',
        'integrity': 'SHA-256 for every original and auxiliary file. Manifest self-hashing is excluded; SHA256SUMS covers complete archives.',
        'files': files, 'auxiliary_files': auxiliary,
    }
    manifest_path = f'{prefix}/MANIFEST.json'
    if any(path == manifest_path for path, _, _ in entries):
        raise ReleaseError(f'Reserved release manifest path already exists in source: {manifest_path}')
    entries.append((manifest_path, json_bytes(manifest), 0o644))
    names = [path for path, _, _ in entries]
    if len(names) != len(set(names)):
        raise ReleaseError('A generated release path collides with an original source file.')
    return sorted(entries), manifest


def write_archive(path, entries, created):
    stamp = (created.year, created.month, created.day, created.hour, created.minute, created.second)
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=True) as archive:
        for name, data, mode in entries:
            safe_relative(name)
            info = zipfile.ZipInfo(name, stamp)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | mode) << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def verify_archive(path, expected):
    prefix = 'subnetiq' if expected['kind'] == 'source' else 'subnetiq-phases'
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ReleaseError(f'Duplicate ZIP entries in {path.name}')
        for name in names:
            safe_relative(name)
            if private_environment(PurePosixPath(name).name):
                raise ReleaseError('A private environment file entered the archive; release refused.')
        manifest_name = f'{prefix}/MANIFEST.json'
        actual = json.loads(archive.read(manifest_name))
        if actual != expected:
            raise ReleaseError(f'Manifest mismatch in {path.name}')
        records = actual['files'] + actual['auxiliary_files']
        if set(names) != {record['archive_path'] for record in records} | {manifest_name}:
            raise ReleaseError(f'Unlisted or missing ZIP entries in {path.name}')
        if len({record['source_path'] for record in actual['files']}) != actual['file_count']:
            raise ReleaseError(f'Original source files are duplicated or missing in {path.name}')
        for record in records:
            data = archive.read(record['archive_path'])
            if len(data) != record['size'] or digest(data) != record['sha256']:
                raise ReleaseError(f'File integrity failed in {path.name}: {record["archive_path"]}')
        if archive.testzip() is not None:
            raise ReleaseError(f'CRC verification failed in {path.name}')


def build_release(root, output=None, check=False):
    root = root.resolve()
    output = (output or root / 'release').resolve()
    if not root.is_dir():
        raise ReleaseError('The project root does not exist.')
    if output == root or root.is_relative_to(output):
        raise ReleaseError('Release output must not replace or contain the source root.')
    selected, excluded_environments = collect_paths(root, output)
    validate_required(root, selected)
    records = snapshot(root, selected)
    stable_snapshot(root, records, output)
    counts = Counter(record['phase'] for record in records)
    summary = {'status': 'validated' if check else 'packaged', 'source_files': len(records), 'source_bytes': sum(record['size'] for record in records), 'phase_counts': {f'{phase:02}': counts[phase] for phase in range(12)}, 'excluded_private_environment_files': excluded_environments}
    if check:
        return summary
    created = timestamp(records)
    output.mkdir(parents=True, exist_ok=True)
    artifacts = []
    with tempfile.TemporaryDirectory(prefix='.release-staging-', dir=output) as temporary:
        staging = Path(temporary)
        for kind, name in [('source', 'SubnetIQ-source.zip'), ('phases', 'SubnetIQ-phases.zip')]:
            entries, manifest = archive_content(kind, records, created)
            target = staging / name
            write_archive(target, entries, created)
            verify_archive(target, manifest)
            artifacts.append({'file': name, 'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes())})
        stable_snapshot(root, records, output)
        checksum_text = ''.join(f'{artifact["sha256"]}  {artifact["file"]}\n' for artifact in artifacts)
        (staging / 'SHA256SUMS').write_text(checksum_text, encoding='utf-8')
        for artifact in artifacts:
            os.replace(staging / artifact['file'], output / artifact['file'])
        os.replace(staging / 'SHA256SUMS', output / 'SHA256SUMS')
    summary['output_directory'] = str(output)
    summary['artifacts'] = artifacts
    return summary


def main():
    parser = argparse.ArgumentParser(description='Build verified complete-source and final-file phase-group archives for SubnetIQ using only the Python standard library.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1], help='Project root; defaults to the parent of this script directory.')
    parser.add_argument('--output', type=Path, help='Output folder; defaults to PROJECT/release.')
    parser.add_argument('--check', action='store_true', help='Validate completeness, paths, environment examples, and source stability without creating archives.')
    args = parser.parse_args()
    print(json.dumps(build_release(args.root, args.output, args.check), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ReleaseError, OSError, ValueError, zipfile.BadZipFile) as error:
        print(f'Release refused: {error}', file=sys.stderr)
        sys.exit(1)
