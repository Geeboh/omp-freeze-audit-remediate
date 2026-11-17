import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { requireThat, text, relative, noSymlinks, now, hash, redact, atomicWrite, snapshot } from './io.mjs';
export function checkSpec(input) {
  const id = text(input.id, 'check id', 64);
  requireThat(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id), 'Invalid check id');
  requireThat(Array.isArray(input.argv) && input.argv.length > 0 && input.argv.length <= 256, 'argv must be a nonempty argument array');
  const argv = input.argv.map(a => { requireThat(typeof a === 'string' && !a.includes('\0') && a.length <= 16000, 'Invalid command argument'); return a; });
  requireThat(argv[0].length > 0, 'Missing executable');
  const cwd = relative(input.cwd ?? '.', { rootAllowed: true });
  const timeoutMs = input.timeoutMs ?? 300000;
  requireThat(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 3600000, 'timeoutMs must be 100..3600000');
  const category = input.category ?? 'tests';
  requireThat(['build', 'tests', 'static', 'security', 'package', 'benchmark', 'validation'].includes(category), 'Invalid check category');
  const resources = (input.resources ?? ['*']).map(x => text(x, 'resource', 200));
  const parallelSafe = input.parallelSafe === true;
  requireThat(!parallelSafe || resources.length > 0 && !resources.includes('*'), 'Parallel-safe checks need explicit resource labels; use a distinct temp DB/build dir/port as appropriate');
  const spec = { id, title: text(input.title ?? id, 'check title', 500), argv, cwd, timeoutMs, category, required: input.required !== false, parallelSafe, resources };
  return { ...spec, specHash: hash(spec) };
}
export function checkWaves(checks, parallel) {
  const waves = [];
  for (const check of checks) {
    const wave = waves.at(-1);
    if (check.parallelSafe && wave && wave.length < parallel && wave.every(c => c.parallelSafe && !c.resources.some(x => check.resources.includes(x)))) wave.push(check);
    else waves.push([check]);
  }
  return waves;
}
export function childEnvironment() {
  const env = { ...process.env, CI: process.env.CI ?? '1' };
  // The parent's node:test harness marker makes a nested `node --test` skip
  // all files while exiting zero. It is process-local harness state, not a
  // project setting. Preserve other intentional runtime settings.
  delete env.NODE_TEST_CONTEXT;
  return env;
}
export async function runProcess(argv, { cwd, timeoutMs, signal, limitBytes = 1024 * 1024 } = {}) {
  requireThat(cwd && timeoutMs > 0, 'Runner requires cwd and timeout');
  if (signal?.aborted) return { exitCode: null, signal: null, cancelled: true, timedOut: false, output: '', truncated: false, durationMs: 0 };
  return new Promise((resolve) => {
    const start = Date.now(); let kept = 0, truncated = false, timedOut = false, cancelled = false, error, chunks = [];
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: childEnvironment() });
    let killTimer;
    const kill = (sig) => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, sig); else child.kill(sig); } catch (e) { if (e.code !== 'ESRCH') error ??= e.message; }
    };
    const terminate = () => { kill('SIGTERM'); killTimer ??= setTimeout(() => kill('SIGKILL'), 250); killTimer.unref?.(); };
    const onAbort = () => { cancelled = true; terminate(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    const collect = data => {
      const b = Buffer.from(data), remaining = Math.max(0, limitBytes - kept);
      if (b.length > remaining) truncated = true;
      if (remaining) { chunks.push(b.subarray(0, remaining)); kept += Math.min(b.length, remaining); }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', e => { error = e.message; });
    child.once('close', (exitCode, sig) => {
      clearTimeout(timeout); clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
      resolve({ exitCode, signal: sig, error, cancelled, timedOut, output: redact(Buffer.concat(chunks).toString('utf8')), truncated, durationMs: Date.now() - start });
    });
  });
}
export async function executeCheck(root, spec, signal) {
  if (spec.cwd !== '.') await noSymlinks(root, spec.cwd, false);
  const cwd = path.join(root, spec.cwd);
  requireThat((await fs.stat(cwd)).isDirectory(), 'Check cwd is not a directory');
  const before = await snapshot(root);
  const startedAt = now(), result = await runProcess(spec.argv, { cwd, timeoutMs: spec.timeoutMs, signal });
  const after = await snapshot(root);
  const id = `E-${randomUUID()}`;
  const log = `.far/evidence/${id}.log`;
  await atomicWrite(root, log, result.output);
  const status = before.digest !== after.digest ? 'CHANGED_DURING_RUN' : result.cancelled ? 'CANCELLED' : result.timedOut ? 'TIMEOUT' : result.exitCode === 0 && !result.error ? 'PASS' : 'FAIL';
  const { output, ...recorded } = result;
  return { id, checkId: spec.id, specHash: spec.specHash, argv: spec.argv, cwd: spec.cwd, startedAt, finishedAt: now(),
    snapshot: before.digest, afterSnapshot: after.digest, status, ...recorded, log, logHash: hash(output),
    environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(),
      removedHarnessVariables: ['NODE_TEST_CONTEXT'], selected: Object.fromEntries(['CI', 'NODE_ENV', 'TZ', 'LANG', 'PYTHONHASHSEED'].map(k => [k, childEnvironment()[k] ?? null])) },
    provenance: 'locally-executed-command', assertion: 'Exit status is recorded; test adequacy and semantic correctness require review.' };
}
