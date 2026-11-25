import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { snapshot } from '../src/io.mjs';

const exec = promisify(execFile);
const samples = 5;
const fileCount = Number(process.env.FAR_M8_FILES ?? 1000);

async function git(root, args) { await exec('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 }); }
async function makeRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'far-m8-'));
  await git(root, ['init', '-q']);
  await git(root, ['config', 'user.name', 'FAR M8']);
  await git(root, ['config', 'user.email', 'far-m8@example.invalid']);
  for (let i = 0; i < fileCount; i++) {
    const component = i % 10 === 0 ? 'src' : 'docs';
    const file = path.join(root, component, `file-${String(i).padStart(5, '0')}.js`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `export const value${i} = ${i};\n`);
  }
  await git(root, ['add', '.']);
  await git(root, ['commit', '-qm', 'M8 fixture']);
  return root;
}
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function summarize(label, rows) {
  const values = rows.map(row => row.durationMs);
  return { label, samples: rows.length, medianMs: median(values), minMs: Math.min(...values), maxMs: Math.max(...values), files: rows[0].files, bytes: rows[0].bytes, rows };
}
const root = await makeRepo();
try {
  const rows = { full: [], scoped: [] };
  for (let i = 0; i < samples * 2; i++) {
    const label = i % 2 === 0 ? 'full' : 'scoped';
    const scope = label === 'scoped' ? { include: ['src'], dependencyMode: 'known-only' } : undefined;
    const start = process.hrtime.bigint();
    const result = await snapshot(root, 50000, scope);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    rows[label].push({ durationMs, files: result.files.length, bytes: result.files.reduce((sum, file) => sum + file.bytes, 0) });
  }
  console.log(JSON.stringify({ schemaVersion: 1, claim: 'Measure source snapshot cost and whether existing scope selection is sufficient before adding storage/cache infrastructure.', environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, loadAverage: os.loadavg() }, fixture: { files: fileCount, samplesPerSide: samples }, results: [summarize('full-snapshot', rows.full), summarize('scoped-snapshot', rows.scoped)], decision: 'MEASURE_ONLY' }, null, 2));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
