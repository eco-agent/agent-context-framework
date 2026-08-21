#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'codebase-meta.mjs');
const fixtureSource = path.resolve(here, '../fixtures/sample-repo');
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'codebase-inventory-fixture-'));
const root = path.join(temporaryRoot, 'sample-repo');
cpSync(fixtureSource, root, { recursive: true });
writeFileSync(path.join(root, 'ignored.tmp'), 'ignored\n');
writeFileSync(path.join(root, 'src/components/logo.png'), Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
process.on('exit', () => rmSync(temporaryRoot, { recursive: true, force: true }));
const envelopeSchema = JSON.parse(readFileSync(path.resolve(here, '../references/result-envelope.schema.json'), 'utf8'));

function run(mode, args = []) {
  const out = execFileSync(process.execPath, [script, mode, '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

function assertEnvelope(result, mode) {
  for (const key of envelopeSchema.required) assert.ok(key in result, `missing envelope key: ${key}`);
  assert.equal(result.schemaVersion, envelopeSchema.properties.schemaVersion.const);
  assert.ok(envelopeSchema.properties.mode.enum.includes(result.mode));
  assert.equal(result.mode, mode);
  assert.ok(Array.isArray(result.warnings));
  for (const warning of result.warnings) {
    assert.ok(envelopeSchema.properties.warnings.items.properties.type.enum.includes(warning.type));
    assert.equal(typeof warning.path, 'string');
    assert.equal(typeof warning.message, 'string');
  }
  assert.ok(result.scan);
  for (const key of envelopeSchema.properties.scan.required) assert.ok(key in result.scan, `missing scan key: ${key}`);
  assert.ok(result.scan.filtersUsed);
  assert.equal(typeof result.scan.defaultExcludesApplied, 'boolean');
  assert.equal(typeof result.scan.gitignoreApplied, 'boolean');
  assert.equal(typeof result.scan.truncated, 'boolean');
  assert.equal(typeof result.scan.symlinksFollowed, 'boolean');
}

const inventory = run('inventory');
assertEnvelope(inventory, 'inventory');
assert.ok(inventory.fileStats.some(f => f.path === 'src/generated/api-client.ts' && f.classification === 'generated' && f.isGenerated));
assert.ok(inventory.fileStats.some(f => f.path === 'src/components/Button.test.tsx' && f.classification === 'test'));
assert.ok(inventory.fileStats.some(f => f.path === 'package-lock.json' && f.classification === 'lockfile'));
assert.ok(inventory.ignored.some(i => i.paths.includes('ignored.tmp') && i.reason === '.gitignore'));
assert.ok(inventory.warnings.some(w => w.type === 'binary_file_skipped' && w.path === 'src/components/logo.png'));

const hotspots = run('loc-hotspots', ['--top', '2']);
assertEnvelope(hotspots, 'loc-hotspots');
assert.ok(hotspots.highestLocFiles.length <= 2);

const tests = run('test-surface-summary');
assertEnvelope(tests, 'test-surface-summary');
assert.ok(tests.testFiles.some(f => f.path === 'src/components/Button.test.tsx'));

const naming = run('naming-pattern-summary');
assertEnvelope(naming, 'naming-pattern-summary');
assert.ok(naming.componentFilePatterns.includes('PascalCase.tsx'));
assert.ok(naming.testFilePatterns.length > 0);

console.log('fixture validation passed');
