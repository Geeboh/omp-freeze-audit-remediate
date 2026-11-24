/** A deterministic coordinator-owned DAG scheduler. It plans/leases work, not model calls. */
import { randomUUID } from 'node:crypto';
import { requireThat, text, relative, now } from './io.mjs';
export const TASK_KINDS = ['audit', 'fix', 'review', 'test', 'document'];
export const TERMINAL_TASK = new Set(['done']);
export function intersects(a, b) {
  return a === '.' || b === '.' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
const overlap = (a, b) => a.some(x => b.some(y => intersects(x, y)));
export function conflicts(a, b, isolated) {
  const aWrite = a.writePaths.length > 0, bWrite = b.writePaths.length > 0;
  if (a.resources.includes('*') || b.resources.includes('*') || a.resources.some(x => b.resources.includes(x))) return true;
  if (!isolated && aWrite && bWrite) return true; // Single shared writer, even for apparently disjoint edits.
  if (overlap(a.writePaths, b.writePaths)) return true; // Isolated but competing patches still conflict.
  return overlap(a.writePaths, b.readPaths) || overlap(b.writePaths, a.readPaths);
}
export function tier(task) {
  const base = task.risk === 'high' ? 2 : task.risk === 'medium' ? 1 : 0;
  return ['economy', 'standard', 'deep'][Math.min(2, base + Math.floor(task.failedRepairs / 2))];
}
export function agentFor(task) {
  const t = tier(task);
  if (task.kind === 'fix' || task.kind === 'document') return t === 'deep' ? 'far-deep-fixer' : t === 'standard' ? 'far-complex-fixer' : 'far-fixer';
  if (task.kind === 'test') return t === 'deep' ? 'far-deep-reviewer' : 'far-investigator';
  if (task.kind === 'review') return t === 'deep' ? 'far-deep-reviewer' : 'far-reviewer';
  return t === 'economy' ? 'far-auditor' : t === 'deep' ? 'far-deep-reviewer' : 'far-investigator';
}
export function validateGraph(tasks) {
  const ids = new Set(tasks.map(t => t.id));
  requireThat(ids.size === tasks.length, 'Duplicate task id');
  const by = new Map(tasks.map(t => [t.id, t]));
  const visiting = new Set(), visited = new Set();
  function walk(id) {
    requireThat(ids.has(id), `Unknown dependency ${id}`);
    requireThat(!visiting.has(id), `Task dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id); for (const d of by.get(id).dependsOn) walk(d); visiting.delete(id); visited.add(id);
  }
  tasks.forEach(t => walk(t.id));
}
export function makeTask(input, existingCount) {
  const id = input.id ?? `T${String(existingCount + 1).padStart(4, '0')}`;
  requireThat(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id), 'Invalid task id');
  const kind = input.kind ?? 'audit', risk = input.risk ?? 'low';
  requireThat(TASK_KINDS.includes(kind) && ['low', 'medium', 'high'].includes(risk), 'Invalid task kind/risk');
  const readPaths = input.readPaths ?? ['.'], writePaths = input.writePaths ?? [];
  requireThat(Array.isArray(readPaths) && Array.isArray(writePaths), 'Task scopes must be arrays');
  for (const p of [...readPaths, ...writePaths]) { relative(p, { rootAllowed: true }); requireThat(!/[*?\[\]]/.test(p), 'Task scopes must be literal paths/prefixes, not globs'); }
  requireThat(!writePaths.includes('.'), 'Editing tasks must use bounded write paths, not the whole repository');
  requireThat(!['fix', 'document'].includes(kind) || writePaths.length > 0, 'Editing tasks need explicit writePaths');
  requireThat(!['audit', 'review', 'test'].includes(kind) || writePaths.length === 0, 'Audit/review/test-execution tasks must be read-only; use fix for creating tests');
  requireThat(!writePaths.some(p => p === '.far' || p.startsWith('.far/')), 'Only the coordinator owns FAR state');
  return { id, title: text(input.title, 'task title', 500), instructions: text(input.instructions, 'task instructions'), kind, risk,
    readPaths, writePaths, dependsOn: input.dependsOn ?? [], resources: (input.resources ?? []).map(x => text(x, 'resource', 200)),
    priority: Number.isFinite(input.priority) ? input.priority : 100, status: 'pending', failedRepairs: 0, attempts: 0,
    createdAt: now(), history: [] };
}
export function selectWave(s, { isolation = false, limit = s.options.parallel } = {}) {
  requireThat(Number.isInteger(limit) && limit >= 1 && limit <= 32, 'Wave limit must be 1..32');
  validateGraph(s.tasks);
  const active = s.tasks.filter(t => t.status === 'running');
  const available = Math.max(0, Math.min(32, limit, s.options.parallel) - active.length);
  const by = new Map(s.tasks.map(t => [t.id, t]));
  const pending = s.tasks.filter(t => t.status === 'pending' && t.dependsOn.every(id => TERMINAL_TASK.has(by.get(id)?.status)));
  const selected = [];
  for (const t of pending.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    if (selected.length >= available) break;
    if (['audit', 'plan', 'verify'].includes(s.mode) && t.writePaths.length) continue;
    if ([...active, ...selected].some(other => conflicts(t, other, isolation))) continue;
    selected.push(t);
  }
  return selected;
}
export function leaseWave(s, opts) {
  const selected = selectWave(s, opts);
  for (const t of selected) {
    t.status = 'running'; t.lease = randomUUID(); t.fencingGeneration = (t.fencingGeneration ?? 0) + 1; t.dispatchKey = randomUUID();
    t.leaseExpiresAt = new Date(Date.now() + (opts.leaseTimeoutSeconds ?? 1800) * 1000).toISOString();
    t.startedAt = now(); t.attempts += 1; t.isolated = !!opts.isolation && t.writePaths.length > 0; t.assignedAgent = agentFor(t);
  }
  return selected.map(t => ({ ...t, tier: tier(t) }));
}
export function settleTask(s, { id, lease, fencing, outcome, summary, infrastructure = false }) {
  const t = s.tasks.find(x => x.id === id);
  requireThat(t && t.status === 'running' && t.lease === lease && (fencing === undefined || t.fencingGeneration === fencing), 'Unknown task, stale lease or task not running', 'LEASE_MISMATCH');
  requireThat(['done', 'failed', 'blocked', 'deferred', 'shelved', 'denied', 'cancelled'].includes(outcome), 'Invalid task outcome');
  summary = text(summary, 'task result summary');
  const beforeTier = tier(t);
  t.history.push({ at: now(), outcome, summary, infrastructure, tier: beforeTier, lease, fencing: t.fencingGeneration });
  if (outcome === 'failed' && !infrastructure) t.failedRepairs += 1;
  if (outcome === 'done') t.status = 'done';
  else if (['blocked', 'deferred', 'shelved', 'denied', 'cancelled'].includes(outcome) || infrastructure) t.status = outcome === 'failed' ? 'blocked' : outcome;
  else {
    const base = t.risk === 'high' ? 2 : t.risk === 'medium' ? 1 : 0;
    t.status = t.failedRepairs >= (3 - base) * 2 ? 'blocked' : 'pending';
  }
  t.summary = summary; delete t.lease;
  return { ...t, nextTier: tier(t) };
}
