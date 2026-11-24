#!/usr/bin/env node
/** Exercise generated ZIP and offline installer. No OMP/provider/model calls. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const exec = promisify(execFile), input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/validate-release.mjs /path/to/generated-install.mjs');
const installer = path.resolve(input), archive = installer.replace(/-install\.mjs$/, '.zip'), tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'far-release-check-'));
const checks = [];
const pass = name => checks.push({ name, status: 'PASS' });
const run = async (file, args = [], options = {}) => exec(process.execPath, [file, ...args], { maxBuffer: 16 * 1024 * 1024, ...options });
const hash = b => createHash('sha256').update(b).digest('hex');
try {
  const dest = path.join(tmp, 'installed package');
  await run(installer, [dest]); pass('offline installer extraction into new directory including spaces');
  const packageData = JSON.parse(await fs.readFile(path.join(dest, 'package.json'), 'utf8'));
  const manifest = await fs.readFile(path.join(dest, 'MANIFEST.sha256'), 'utf8');
  let files = 0;
  for (const line of manifest.trim().split('\n')) {
    const [expected, rel] = line.split('  '); assert.equal(hash(await fs.readFile(path.join(dest, rel))), expected, rel); files++;
  }
  assert(files > 0); pass('every staged manifest file matches its SHA-256');
  const check = JSON.parse((await run(path.join(dest, 'scripts/check-package.mjs'))).stdout); assert.equal(check.problems.length, 0); assert.equal(check.version, packageData.version); pass('installed package discovery metadata, links and syntax checks');
  const manifestCheck = await run(path.join(dest, 'scripts/check-manifest.mjs'), [dest]); assert.match(manifestCheck.stdout, /\"status\": \"PASS\"/); pass('installed package manifest check');
  const help = await run(path.join(dest, 'bin/far.mjs'), ['help']); assert.match(help.stdout, new RegExp(packageData.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); pass('installed standalone CLI help');
  const mod = await exec(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify('file://' + path.join(dest, 'src/index.js'))}); if(typeof m.default!=='function') process.exit(1);`]); pass('installed ESM entry imports without third-party dependencies');
  const zipDest = path.join(tmp, 'zip package');
  await exec('unzip', ['-q', archive, '-d', zipDest]); const zipRoot = path.join(zipDest, `${packageData.name}-${packageData.version}`); assert.equal((await fs.stat(path.join(zipRoot, 'package.json'))).isFile(), true); pass('ZIP extracts required installed files');
  await fs.writeFile(path.join(dest, 'preserve-me.txt'), 'user-change');
  await assert.rejects(run(installer, [dest])); assert.equal(await fs.readFile(path.join(dest, 'preserve-me.txt'), 'utf8'), 'user-change'); pass('existing destination refused without changing existing files');
  const existingFile = path.join(tmp, 'existing-file'); await fs.writeFile(existingFile, 'original'); await assert.rejects(run(installer, [existingFile])); assert.equal(await fs.readFile(existingFile, 'utf8'), 'original'); pass('existing file destination refused');
  const real = path.join(tmp, 'real'), link = path.join(tmp, 'link'); await fs.mkdir(real); await fs.symlink(real, link, 'dir'); await assert.rejects(run(installer, [path.join(link, 'new')])); await assert.rejects(fs.access(path.join(real, 'new'))); pass('symlinked ancestor refused');
  const original = await fs.readFile(installer, 'utf8'), m = original.match(/const PAYLOAD = (\"[^\"\\n]+\");/); assert(m);
  const entries = JSON.parse(gunzipSync(Buffer.from(JSON.parse(m[1]), 'base64')).toString());
  async function modified(name, change) {
    const copy = structuredClone(entries); change(copy);
    const payload = JSON.stringify(gzipSync(Buffer.from(JSON.stringify(copy))).toString('base64'));
    const f = path.join(tmp, name + '.mjs'); await fs.writeFile(f, original.replace(m[0], `const PAYLOAD = ${payload};`)); return f;
  }
  const badHash = await modified('bad-hash', es => { es[0].sha256 = '0'.repeat(64); });
  const badDest = path.join(tmp, 'bad-hash-output'); await assert.rejects(run(badHash, [badDest])); await assert.rejects(fs.access(badDest)); pass('corrupt payload rejected before creating destination');
  const traversal = await modified('bad-path', es => { es[0].path = '../escape'; });
  await assert.rejects(run(traversal, [path.join(tmp, 'bad-path-output')])); await assert.rejects(fs.access(path.join(tmp, 'escape'))); pass('embedded path traversal refused');
  const duplicate = await modified('duplicate', es => { es.push(es[0]); }); await assert.rejects(run(duplicate, [path.join(tmp, 'duplicate-output')])); pass('duplicate embedded filenames refused');
  await run(installer, ['--help']); await assert.rejects(run(installer, [])); pass('installer help and invalid-argument behavior');
  console.log(JSON.stringify({ version: packageData.version, installerChecks: checks.length, pass: checks.length, fail: 0, manifestFiles: files, checks, liveOmpHost: 'NOT_RUN' }, null, 2));
} finally { await fs.rm(tmp, { recursive: true, force: true }); }
