#!/usr/bin/env node
/** Offline package extraction plus verified Bun prerequisite installation. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
const exec = promisify(execFile);
const PACKAGE_NAME = '__FAR_PACKAGE_NAME__';
const BUN_MIN_VERSION = '__FAR_BUN_VERSION__';
const PAYLOAD = '__FAR_EMBEDDED_PAYLOAD__';
const sha = b => createHash('sha256').update(b).digest('hex');
function need(ok, message) { if (!ok) throw new Error(message); }
async function exists(file) { try { return await fs.lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function parentsAreReal(file) {
  const resolved = path.resolve(file), parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); const st = await exists(current);
    if (st) need(!st.isSymbolicLink() && st.isDirectory(), `Refusing symlink/non-directory ancestor: ${current}`);
  }
}
function versionParts(value) { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? ''); return m ? m.slice(1).map(Number) : null; }
function atLeast(value, minimum) {
  const a = versionParts(value), b = versionParts(minimum);
  return !!a && !!b && (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))));
}
async function bunVersion(binary = 'bun') {
  try { return (await exec(binary, ['--version'], { maxBuffer: 1024 * 1024 })).stdout.trim(); } catch { return null; }
}
async function ensureBun() {
  const current = await bunVersion();
  if (current && atLeast(current, BUN_MIN_VERSION)) return { version: current, installed: false };
  const script = 'curl -fsSL https://bun.com/install | bash -s -- bun-v' + BUN_MIN_VERSION;
  if (process.platform === 'win32') {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'irm https://bun.com/install.ps1 | iex'], { maxBuffer: 4 * 1024 * 1024 });
  } else {
    await exec('bash', ['-lc', script], { maxBuffer: 4 * 1024 * 1024 });
  }
  const installedBinary = process.platform === 'win32' ? path.join(process.env.USERPROFILE ?? os.homedir(), '.bun', 'bin', 'bun.exe') : path.join(process.env.BUN_INSTALL ?? path.join(os.homedir(), '.bun'), 'bin', 'bun');
  const installed = await bunVersion(installedBinary);
  need(installed && atLeast(installed, BUN_MIN_VERSION), `Bun ${BUN_MIN_VERSION}+ is required; installation did not produce a usable Bun binary`);
  return { version: installed, installed: true };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`Usage: node ${PACKAGE_NAME}-install.mjs NEW_DESTINATION\nInstalls verified package files and Bun ${BUN_MIN_VERSION}+ when absent. Requires Node.js 22+, network access for missing Bun, and unzip on Linux/macOS.`);
    return;
  }
  need(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 or later is required');
  need(args.length === 1 && !args[0].startsWith('-'), 'Provide exactly one new destination directory; use --help');
  const target = path.resolve(args[0]);
  need(!(await exists(target)), `Destination exists; refusing overwrite: ${target}`);
  await parentsAreReal(path.dirname(target));
  need(PAYLOAD !== '__FAR_' + 'EMBEDDED_PAYLOAD__', 'This is the build template, not the generated installer');
  const entries = JSON.parse(gunzipSync(Buffer.from(PAYLOAD, 'base64'), { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8'));
  need(Array.isArray(entries) && entries.length > 0 && entries.length <= 2000, 'Invalid embedded package');
  const seen = new Set(); let total = 0;
  for (const e of entries) {
    need(typeof e.path === 'string' && !e.path.includes('\\') && !e.path.includes('\0') && !path.posix.isAbsolute(e.path) && !/^[A-Za-z]:/.test(e.path), 'Unsafe embedded path');
    need(e.path.split('/').every(p => p && p !== '.' && p !== '..'), 'Embedded path traversal');
    need(!seen.has(e.path), 'Duplicate embedded path'); seen.add(e.path);
    e.bytes = Buffer.from(e.data, 'base64'); total += e.bytes.length;
    need(total <= 32 * 1024 * 1024 && sha(e.bytes) === e.sha256, `Embedded integrity mismatch: ${e.path}`);
    need([0o644, 0o755].includes(e.mode), 'Unexpected embedded mode');
  }
  const bun = await ensureBun();
  await fs.mkdir(path.dirname(target), { recursive: true }); await parentsAreReal(path.dirname(target));
  let created = false;
  try {
    await fs.mkdir(target, { mode: 0o700 }); created = true;
    for (const e of entries) {
      const out = path.join(target, e.path); await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
      await fs.writeFile(out, e.bytes, { flag: 'wx', mode: e.mode });
      need(sha(await fs.readFile(out)) === e.sha256, `Written integrity mismatch: ${e.path}`);
    }
  } catch (e) { if (created) await fs.rm(target, { recursive: true, force: true }); throw e; }
  console.log(`Installed ${entries.length} verified files to ${target}\nBun ${bun.version} is available${bun.installed ? ' and was installed by FAR' : ''}.\nNo OMP configuration changed. Register the whole directory explicitly:\n  omp plugin link ${JSON.stringify(target)}\nThen start a new OMP session, or run:\n  node ${JSON.stringify(path.join(target, 'bin/far.mjs'))} launch full --root /path/to/project --parallel 4\nHashes verify integrity, not publisher authenticity. Live OMP-host compatibility is documented in docs/COMPATIBILITY.md.`);
}
main().catch(e => { console.error(`FAR installer: ${e.message}`); process.exitCode = 1; });
