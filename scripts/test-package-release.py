import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('package-release.py')
SPEC = importlib.util.spec_from_file_location('subnetiq_release', SCRIPT)
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


class ReleasePackagingTests(unittest.TestCase):
    def setUp(self):
        workspace = Path(__file__).resolve().parents[2]
        self.temporary = tempfile.TemporaryDirectory(prefix='subnetiq-package-test-', dir=workspace)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'project'
        self.output = self.base / 'artifacts'
        self.root.mkdir()
        for relative in RELEASE.REQUIRED_FILES:
            if relative.endswith('.env.example'):
                data = b'OPENAI_API_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\nVITE_APP_NAME=SubnetIQ\n'
            elif relative.endswith('.pdf'):
                data = b'%PDF-1.4\nRelease fixture only\n'
            else:
                data = f'Release fixture for {relative}\n'.encode()
            self.write(relative, data)
        self.write('pnpm-workspace.yaml', b"packages:\n  - apps/*\n  - packages/*\npatchedDependencies:\n  '@rollup/plugin-terser@1.0.0': patches/@rollup__plugin-terser@1.0.0.patch\n")
        for index in range(12):
            self.write(f'content/courses/module-{index}.md', b'# Test module\n')
        for index in range(5):
            self.write(f'content/blog/article-{index}.md', b'# Test article\n')
            self.write(f'content/cheatsheets/sheet-{index}.md', b'# Test sheet\n')
        self.write('supabase/migrations/001_fixture.sql', b'select 1;\n')
        self.write('packages/netcalc/tests/fixture.test.ts', b'export {};\n')
        self.write('apps/api/tests/fixture.test.ts', b'export {};\n')
        self.write('tests/e2e/fixture.spec.ts', b'export {};\n')
        self.write('assets/byte-fixture.bin', bytes(range(256)))
        self.write('scripts/executable-fixture.sh', b'printf release-test\n')
        (self.root / 'scripts/executable-fixture.sh').chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, relative, data):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def package(self):
        with patch.dict(os.environ, {'SOURCE_DATE_EPOCH': '1791100800'}):
            return RELEASE.build_release(self.root, self.output)

    def extract_phases(self):
        target = self.base / 'extracted'
        with zipfile.ZipFile(self.output / 'SubnetIQ-phases.zip') as archive:
            archive.extractall(target)
        return target / 'subnetiq-phases'

    def helper(self, phases, *arguments):
        return subprocess.run([sys.executable, str(phases / 'REASSEMBLE.py'), *arguments], capture_output=True, text=True, timeout=20)

    def test_complete_archives_have_matching_source_hashes_exactly_once(self):
        result = self.package()
        manifests = []
        for filename, prefix in [('SubnetIQ-source.zip', 'subnetiq'), ('SubnetIQ-phases.zip', 'subnetiq-phases')]:
            with zipfile.ZipFile(self.output / filename) as archive:
                manifest = json.loads(archive.read(prefix + '/MANIFEST.json'))
                manifests.append(manifest)
                self.assertEqual(len(manifest['files']), result['source_files'])
                self.assertEqual(len({entry['source_path'] for entry in manifest['files']}), result['source_files'])
                for entry in manifest['files'] + manifest['auxiliary_files']:
                    data = archive.read(entry['archive_path'])
                    self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
                    self.assertEqual(len(data), entry['size'])
                self.assertIsNone(archive.testzip())
        source_hashes = {entry['source_path']: entry['sha256'] for entry in manifests[0]['files']}
        phase_hashes = {entry['source_path']: entry['sha256'] for entry in manifests[1]['files']}
        self.assertEqual(source_hashes, phase_hashes)
        self.assertEqual({entry['phase'] for entry in manifests[1]['files']}, set(range(12)))
        for line in (self.output / 'SHA256SUMS').read_text().splitlines():
            expected, filename = line.split('  ', 1)
            self.assertEqual(hashlib.sha256((self.output / filename).read_bytes()).hexdigest(), expected)

    def test_private_environment_dependencies_and_build_outputs_are_excluded(self):
        forbidden = ['.env', '.env.local', 'apps/api/.env.production', 'apps/web/.env.test', '.envrc', 'node_modules/module/index.js', '.cache/cached.bin', 'apps/web/dist/index.html', 'coverage/report.html', 'release/old.zip', 'private.key', 'packages/shared/tsconfig.tsbuildinfo']
        for path in forbidden:
            self.write(path, b'test-secret-value-not-for-release')
        result = self.package()
        self.assertEqual(len(result['excluded_private_environment_files']), 4)
        with zipfile.ZipFile(self.output / 'SubnetIQ-source.zip') as archive:
            names = archive.namelist()
            for path in forbidden:
                self.assertNotIn('subnetiq/' + path, names)
            self.assertIn('subnetiq/apps/api/.env.example', names)
            self.assertIn('subnetiq/apps/web/.env.example', names)

    def test_missing_required_verification_refuses_without_artifacts(self):
        (self.root / 'docs/verification.md').unlink()
        with self.assertRaisesRegex(RELEASE.ReleaseError, 'docs/verification.md'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_private_credential_in_example_is_refused_without_printing_value(self):
        secret = 'sk-test-sensitive-value-12345678901234567890'
        self.write('apps/api/.env.example', ('OPENAI_API_KEY=' + secret + '\n').encode())
        with self.assertRaises(RELEASE.ReleaseError) as error:
            self.package()
        self.assertIn('Non-placeholder credential', str(error.exception))
        self.assertNotIn(secret, str(error.exception))
        self.assertFalse(self.output.exists())

    def test_unregistered_required_dependency_patch_is_refused(self):
        self.write('pnpm-workspace.yaml', b'packages:\n  - apps/*\n  - packages/*\n')
        with self.assertRaisesRegex(RELEASE.ReleaseError, 'not registered'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_check_only_creates_no_archives(self):
        summary = RELEASE.build_release(self.root, self.output, check=True)
        self.assertEqual(summary['status'], 'validated')
        self.assertFalse(self.output.exists())

    def test_reassembly_reconstructs_all_bytes_and_refuses_populated_destination(self):
        self.package()
        phases = self.extract_phases()
        renamed = phases.with_name('renamed-phase-folder')
        phases.rename(renamed)
        phases = renamed
        verified = self.helper(phases, '--verify-only')
        self.assertEqual(verified.returncode, 0, verified.stderr)
        destination = self.base / 'rebuilt'
        built = self.helper(phases, '--output', str(destination))
        self.assertEqual(built.returncode, 0, built.stderr)
        selected, _ = RELEASE.collect_paths(self.root)
        for path in selected:
            self.assertEqual((destination / path).read_bytes(), (self.root / path).read_bytes())
        self.assertEqual(len([path for path in destination.rglob('*') if path.is_file()]), len(selected))
        if os.name != 'nt':
            self.assertTrue((destination / 'scripts/executable-fixture.sh').stat().st_mode & 0o100)
        again = self.helper(phases, '--output', str(destination))
        self.assertNotEqual(again.returncode, 0)
        self.assertIn('never overwritten', again.stderr)

    def test_reassembly_detects_modified_source_before_writing(self):
        self.package()
        phases = self.extract_phases()
        manifest = json.loads((phases / 'MANIFEST.json').read_text())
        entry = manifest['files'][0]
        path = phases.joinpath(*Path(entry['archive_path']).parts[1:])
        path.write_bytes(b'modified')
        destination = self.base / 'never-created'
        result = self.helper(phases, '--output', str(destination))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('integrity check failed', result.stderr)
        self.assertFalse(destination.exists())

    def test_same_snapshot_and_epoch_are_reproducible(self):
        first = self.package()
        second = self.package()
        self.assertEqual(first['artifacts'], second['artifacts'])

    def test_extracted_source_can_be_packaged_again_without_manifest_recursion(self):
        self.package()
        target = self.base / 'source-extracted'
        with zipfile.ZipFile(self.output / 'SubnetIQ-source.zip') as archive:
            original = json.loads(archive.read('subnetiq/MANIFEST.json'))
            archive.extractall(target)
        rebuilt_output = self.base / 'rebuilt-artifacts'
        RELEASE.build_release(target / 'subnetiq', rebuilt_output)
        with zipfile.ZipFile(rebuilt_output / 'SubnetIQ-source.zip') as archive:
            rebuilt = json.loads(archive.read('subnetiq/MANIFEST.json'))
        self.assertEqual(
            {entry['source_path']: entry['sha256'] for entry in original['files']},
            {entry['source_path']: entry['sha256'] for entry in rebuilt['files']},
        )
        self.assertNotIn('MANIFEST.json', {entry['source_path'] for entry in rebuilt['files']})

    def test_unrecognized_root_manifest_is_refused(self):
        self.write('MANIFEST.json', b'{"purpose":"unrelated source manifest"}')
        with self.assertRaisesRegex(RELEASE.ReleaseError, 'reserved for generated release metadata'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_phase_assignment_preserves_feature_and_operational_boundaries(self):
        examples = {
            'docs/phases/phase-00-research.pdf': 0,
            'packages/shared/src/index.ts': 1,
            'patches/@rollup__plugin-terser@1.0.0.patch': 1,
            'docs/implementation-contract.md': 1,
            'packages/netcalc/tests/core.test.ts': 2,
            'supabase/migrations/schema.sql': 3,
            'apps/api/src/services/ai/providers/openai.ts': 4,
            'apps/web/src/lib/auth.tsx': 5,
            'apps/web/src/pages/ProjectPage.tsx': 6,
            'docs/phases/phase-06-projects.md': 6,
            'packages/shared/src/practice.test.ts': 7,
            'data/glossary.json': 7,
            'content/cheatsheets/cidr.md': 7,
            'data/ports.json': 8,
            'apps/web/src/lib/stream.ts': 9,
            'apps/web/public/icon-192.png': 10,
            'apps/web/Dockerfile': 11,
            'tests/e2e/learning.spec.ts': 11,
        }
        for path, phase in examples.items():
            with self.subTest(path=path):
                self.assertEqual(RELEASE.phase_for(path), phase)

    @unittest.skipIf(os.name == 'nt', 'Symbolic link creation may require extra Windows privileges.')
    def test_selected_symbolic_links_are_refused(self):
        (self.root / 'linked-source').symlink_to(self.root / 'README.md')
        with self.assertRaisesRegex(RELEASE.ReleaseError, 'symbolic link'):
            self.package()


if __name__ == '__main__':
    unittest.main(verbosity=2)
