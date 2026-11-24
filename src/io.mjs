/** Local persistence and Git snapshots. No third-party dependencies. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const execFileAsync = promisify(execFile);
export const VERSION = '1.0.0';
export const STATE_DIR = '.far';
export const now = () => new Date().toISOString();
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function requireThat(test, message, code = 'INVALID_INPUT') {
  if (!test) { const e = new Error(message); e.code = code; throw e; }
}
export function text(v, label = 'value', max = 16000) {
  requireThat(typeof v === 'string' && v.trim().length > 0 && v.length <= max, `${label} must be nonempty text (maximum ${max} characters)`);
  return v.trim();
}
export function relative(p, { rootAllowed = false } = {}) {
  requireThat(typeof p === 'string' && !p.includes('\0') && !p.includes('\\'), 'Expected a POSIX-style relative path');
  if (rootAllowed && p === '.') return '.';
  requireThat(p !== '' && !path.posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p) && p.split('/').every(x => x !== '..' && x !== '' && x !== '.'), `Unsafe path: ${p}`);
  return p;
}
export async function noSymlinks(root, rel, allowMissing = true) {
  let p = root;
  for (const part of relative(rel).split('/')) {
    p = path.join(p, part);
    try { requireThat(!(await fs.lstat(p)).isSymbolicLink(), `Refusing symlink in managed path: ${p}`, 'UNSAFE_PATH'); }
    catch (e) { if (e.code === 'ENOENT' && allowMissing) return; throw e; }
  }
}
export async function git(root, args, { optional = false } = {}) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    return stdout;
  } catch (e) { if (optional) return null; throw e; }
}
export async function repositoryRoot(cwd) {
  const real = await fs.realpath(path.resolve(cwd));
  const root = await git(real, ['rev-parse', '--show-toplevel'], { optional: true });
  requireThat(root, 'FAR requires a Git working tree. Initialize Git first, or select the repository root.', 'NO_REPOSITORY');
  return fs.realpath(root.trim());
}
export async function fileHash(file) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
function pathInScope(name, scope) {
  if (!scope || scope.unknownDependencies === true) return true;
  const include = scope.include?.length ? scope.include : ['.'];
  const excluded = scope.exclude ?? [];
  const matches = prefix => prefix === '.' || name === prefix || name.startsWith(`${prefix}/`);
  return include.some(matches) && !excluded.some(matches);
}
export async function snapshot(root, maxFiles = 50000, scope) {
  const names = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))]
    .filter(name => pathInScope(name, scope)).sort();
  requireThat(names.length <= maxFiles, `Repository inventory exceeds ${maxFiles} files; deliberately revise the limit/scope before proceeding`, 'SCOPE_LIMIT');
  const files = [];
  // Git controls enumeration; do not traverse symlinks, ignored caches, or submodules.
  for (const name of names) {
    relative(name);
    if (name === STATE_DIR || name.startsWith(`${STATE_DIR}/`)) continue;
    const full = path.join(root, name);
    try {
      const stat = await fs.lstat(full);
      // Refuse a symlinked ancestor even when the leaf itself is not a symlink.
      const parent = path.posix.dirname(name);
      if (parent !== '.') await noSymlinks(root, parent, false);
      if (stat.isSymbolicLink()) files.push({ path: name, kind: 'symlink', hash: hash(await fs.readlink(full)), bytes: stat.size, executable: false });
      else if (stat.isFile()) files.push({ path: name, kind: 'file', hash: await fileHash(full), bytes: stat.size, executable: !!(stat.mode & 0o111) });
      else if (stat.isDirectory()) files.push({ path: name, kind: 'external-tree', hash: hash(await git(full, ['rev-parse', 'HEAD'], { optional: true }) ?? 'unavailable'), bytes: 0, executable: false });
      else files.push({ path: name, kind: 'special', hash: 'unreadable-special', bytes: stat.size, executable: false });
    } catch (e) {
      if (e.code === 'ENOENT') files.push({ path: name, kind: 'deleted', hash: 'deleted', bytes: 0, executable: false });
      else throw e;
    }
  }
  return { digest: hash(files), files, scannedAt: now(), scope: 'Git tracked + nonignored untracked; .far excluded; symlinks not followed; submodules are integration boundaries' };
}
export async function gitState(root) {
  return {
    head: (await git(root, ['rev-parse', '--verify', 'HEAD'], { optional: true }))?.trim() ?? null,
    branch: (await git(root, ['branch', '--show-current'], { optional: true }))?.trim() ?? null,
    porcelain: await git(root, ['status', '--porcelain=v1', '-z', '--', '.', ':(exclude).far']),
  };
}
export async function ensureStateDir(root) {
  await noSymlinks(root, STATE_DIR);
  await fs.mkdir(path.join(root, STATE_DIR), { recursive: true, mode: 0o700 });
}
export async function migrateState(value, root) {
  requireThat(value?.schemaVersion === 1, 'Only FAR schema version 1 can be migrated', 'MIGRATION_UNSUPPORTED');
  const { normalizePolicy, emptyBudget } = await import('./policy.mjs');
  const policy = normalizePolicy();
  return {
    ...value,
    schemaVersion: 2,
    root,
    lifecycle: value.status === 'complete' ? 'closed' : value.status,
    outcome: value.status === 'complete' ? 'COMPLETE' : null,
    pauseReason: null,
    options: { ...value.options, profile: policy.profile, policy },
    escalationRequests: [],
    approvalGrants: [],
    budget: emptyBudget(policy),
    dispatch: { intents: [], workers: [] },
    idempotency: {},
    progress: { waves: 0, noProgressWaves: 0, history: [], lastFingerprint: null },
    plan: { revision: 0, entries: [] },
  };
}
export async function readState(root, required = true) {
  await noSymlinks(root, `${STATE_DIR}/state.json`);
  try {
    let s = JSON.parse(await fs.readFile(path.join(root, STATE_DIR, 'state.json'), 'utf8'));
    requireThat((s.schemaVersion === 1 || s.schemaVersion === 2) && Array.isArray(s.tasks) && Array.isArray(s.findings) && Array.isArray(s.runs) && s.root === root, 'Unsupported, relocated or damaged FAR state; preserve it and inspect before recovery', 'STATE_INVALID');
    if (s.schemaVersion === 1) s = await migrateState(s, root);
    requireThat(['audit', 'plan', 'remediate', 'verify', 'full'].includes(s.mode) && ['active', 'paused', 'blocked', 'complete'].includes(s.status) && ['feature-freeze', 'code-freeze', 'release-candidate'].includes(s.stage) && Number.isInteger(s.revision) && s.options && Number.isInteger(s.options.parallel) && s.options.parallel >= 1 && s.options.parallel <= 32 && ['auto', 'current'].includes(s.options.modelMode) && s.coverage && s.contract && Array.isArray(s.checks) && Array.isArray(s.reviews), 'Invalid FAR ledger fields; preserve state and investigate', 'STATE_INVALID');
    return s;
  } catch (e) { if (e.code === 'ENOENT' && !required) return null; throw e; }
}
export async function atomicWrite(root, rel, value) {
  await noSymlinks(root, rel);
  const target = path.join(root, relative(rel));
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${randomUUID()}.tmp`;
  const file = await fs.open(tmp, 'wx', 0o600);
  try {
    await file.writeFile(typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
  } finally { await file.close(); }
  try { await fs.rename(tmp, target); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
}
export async function withLock(root, callback, waitMs = 5000) {
  await ensureStateDir(root);
  const lock = path.join(root, STATE_DIR, 'write.lock');
  const start = Date.now();
  let handle;
  while (!handle) {
    try { handle = await fs.open(lock, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      requireThat(Date.now() - start < waitMs, 'FAR state is locked by another writer. Retry after it completes; never delete a live lock.', 'STATE_BUSY');
      await new Promise(r => setTimeout(r, 25));
    }
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), at: now() }));
  try { return await callback(); }
  finally { await handle.close(); await fs.unlink(lock); }
}
export async function repairDeadLock(root) {
  await noSymlinks(root, `${STATE_DIR}/write.lock`, false);
  const lock = path.join(root, STATE_DIR, 'write.lock');
  const owner = JSON.parse(await fs.readFile(lock, 'utf8'));
  requireThat(owner.host === os.hostname() && Number.isInteger(owner.pid) && owner.pid > 0, 'Cannot establish lock ownership; refusing automatic recovery');
  let alive = true;
  try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e; }
  requireThat(!alive, `Lock owner PID ${owner.pid} is still alive`, 'LIVE_LOCK');
  await fs.unlink(lock);
  return { recovered: true, owner };
}
export async function mutate(root, fn) {
  return withLock(root, async () => {
    const s = await readState(root);
    const result = await fn(s);
    s.revision += 1; s.updatedAt = now();
    await atomicWrite(root, `${STATE_DIR}/state.json`, s);
    return result;
  });
}
export function event(s, kind, data = {}) { s.events.push({ at: now(), kind, ...data }); }
export function redact(input) {
  return String(input)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[REDACTED TOKEN]');
}
