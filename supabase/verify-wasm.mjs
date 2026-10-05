import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const directory = path.dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
let assertions = 0;

try {
  const version = await db.query('select version() as version');
  process.stdout.write(`${version.rows[0].version}\n`);
  await db.exec(await readFile(path.join(directory, 'wasm-bootstrap.sql'), 'utf8'));
  const migrationFiles = (await readdir(path.join(directory, 'migrations')))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    await db.exec(await readFile(path.join(directory, 'migrations', file), 'utf8'));
    process.stdout.write(`Applied ${file}\n`);
  }
  await db.exec(await readFile(path.join(directory, 'seed.sql'), 'utf8'));
  const firstSeed = await db.query(
    'select count(*)::integer as count from public.network_templates',
  );
  assert.equal(firstSeed.rows[0].count, 4);
  await db.exec(await readFile(path.join(directory, 'seed.sql'), 'utf8'));
  const repeatedSeed = await db.query(
    'select count(*)::integer as count from public.network_templates',
  );
  assert.equal(repeatedSeed.rows[0].count, 4);
  process.stdout.write('Seed is repeatable and contains four templates.\n');
  const testFiles = (await readdir(path.join(directory, 'tests')))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  assert.ok(testFiles.length > 0, 'No database test files were found.');
  for (const file of testFiles) {
    const outputs = await db.exec(await readFile(path.join(directory, 'tests', file), 'utf8'));
    const lines = outputs
      .flatMap((output) => output.rows.flatMap((row) => Object.values(row)))
      .filter((value) => typeof value === 'string');
    const failures = lines.filter((line) => /^not ok /m.test(line));
    const passed = lines.filter((line) => /^ok /m.test(line)).length;
    for (const line of lines.filter((line) => /^(?:not )?ok |^1\.\./m.test(line)))
      process.stdout.write(`${line}\n`);
    assert.equal(failures.length, 0, failures.join('\n'));
    assert.ok(passed > 0, `No assertions ran in ${file}`);
    assert.ok(lines.includes(`1..${passed}`), `TAP plan and assertion count differ in ${file}`);
    assertions += passed;
    process.stdout.write(`${file}: ${passed} assertions passed.\n`);
  }
  process.stdout.write(
    `PASS: ${migrationFiles.length} migrations, repeatable seed, and ${assertions} PostgreSQL policy/behavior assertions.\n`,
  );
  process.stdout.write(
    'Runtime scope: PostgreSQL WASM with minimal auth/storage schema fixtures; Supabase HTTP services, OAuth, mail delivery, signed URLs, and native multi-connection tests are separate deployment gates.\n',
  );
} finally {
  await db.close();
}
