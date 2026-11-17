import { hash } from './io.mjs';
import { TERMINAL_TASK } from './scheduler.mjs';
export const MODES = ['audit', 'plan', 'remediate', 'verify', 'full'];
export function coverage(s, snap = s.inventory) {
  if (!snap) return { reviewed: 0, total: 0, remaining: [] };
  const remaining = snap.files.filter(f => s.coverage[f.path]?.hash !== f.hash || s.coverage[f.path]?.kind !== f.kind || s.coverage[f.path]?.executable !== f.executable);
  return { reviewed: snap.files.length - remaining.length, total: snap.files.length, remaining: remaining.map(f => f.path) };
}
export function latestRun(s, check) { return s.runs.filter(r => r.checkId === check.id).at(-1); }
export function runIsFresh(run, check, snap) {
  return !!run && run.integrity !== false && run.status === 'PASS' && run.specHash === check.specHash && run.snapshot === snap.digest && run.afterSnapshot === snap.digest;
}
export function reviewIsFresh(review, snap) {
  return review?.snapshot === snap.digest && review.verdict === 'approve' && review.reviewer !== review.implementer;
}
export function contractHash(s) { return hash(s.checks.map(c => ({ id: c.id, specHash: c.specHash, required: c.required }))); }
export function evaluate(s, snap, { final = true } = {}) {
  const c = coverage(s, snap), criteria = [];
  const add = (id, passed, detail) => criteria.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  add('inventory', snap.files.length > 0 && s.inventory?.digest === snap.digest, { files: snap.files.length, current: s.inventory?.digest === snap.digest });
  add('review-coverage', c.total > 0 && c.reviewed === c.total, c);
  // Integration review is NOT a recursive audit of an external submodule.
  const unknownBoundaries = snap.files.filter(f => ['external-tree', 'special'].includes(f.kind) && s.boundaries[f.path]?.hash !== f.hash);
  add('scope-boundaries', unknownBoundaries.length === 0, unknownBoundaries.map(f => f.path));
  add('no-active-workers', !s.tasks.some(t => t.status === 'running') && !s.checkBatch, 'Settle all native workers and running command batches before completing a phase.');
  if (s.mode === 'audit') add('audit-tasks-settled', s.tasks.every(t => t.status === 'done'), s.tasks.filter(t => t.status !== 'done').map(t => t.id));
  if (s.mode === 'audit') return result(s, criteria, snap, false);
  add('verification-contract', s.contract.sealed && s.contract.hash === contractHash(s), { sealed: s.contract.sealed, note: s.contract.note });
  add('automated-tests-defined', s.checks.some(x => x.required && ['tests', 'validation'].includes(x.category)), 'At least one required executable test/validation check; no invented universal coverage target.');
  if (s.mode === 'plan') return result(s, criteria, snap, false);
  const undecided = s.findings.filter(f => !['verified', 'dismissed', 'deferred'].includes(f.status));
  const badDeferrals = s.findings.filter(f => f.status === 'deferred' && (f.releaseBlocking || ['critical', 'high'].includes(f.severity)));
  const staleDismissals = s.findings.filter(f => f.status === 'dismissed' && f.releaseBlocking && f.dispositionSnapshot !== snap.digest);
  add('dismissal-evidence-current', staleDismissals.length === 0, staleDismissals.map(f => f.id));
  const staleFindings = s.findings.filter(f => f.status === 'verified' && (f.verifiedSnapshot !== snap.digest || !f.evidenceIds?.some(id => {
    const r = s.runs.find(x => x.id === id), ck = r && s.checks.find(x => x.id === r.checkId);
    return ck && runIsFresh(r, ck, snap);
  })));
  add('finding-disposition', undecided.length === 0 && badDeferrals.length === 0, [...undecided, ...badDeferrals].map(f => f.id));
  add('fix-evidence-current', staleFindings.length === 0, staleFindings.map(f => f.id));
  const unfinished = s.tasks.filter(t => !TERMINAL_TASK.has(t.status));
  add('tasks-settled', unfinished.length === 0 && !s.checkBatch, unfinished.map(t => ({ id: t.id, status: t.status })));
  const checks = s.checks.filter(x => x.required).map(check => ({ id: check.id, passed: runIsFresh(latestRun(s, check), check, snap), last: latestRun(s, check)?.status ?? 'NOT_RUN', integrity: latestRun(s, check)?.integrityReason ?? 'not checked'  }));
  add('mandatory-checks', checks.length > 0 && checks.every(x => x.passed), checks);
  if (final) {
    add('independent-final-review', s.reviews.some(r => r.scope === 'final' && reviewIsFresh(r, snap)), 'A separate reviewer context must assess the current snapshot; this remains a recorded agent attestation, not a cryptographic identity claim.');
    add('candidate-stage', s.stage === 'release-candidate', s.stage);
  }
  return result(s, criteria, snap, true);
}
function result(s, criteria, snap, assessesRelease) {
  const pass = criteria.every(c => c.status === 'PASS');
  return { evaluatedSnapshot: snap.digest, mode: s.mode, stage: s.stage, allPassed: pass,
    criteria, passed: criteria.filter(c => c.status === 'PASS').length, total: criteria.length,
    readiness: !assessesRelease ? 'NOT_ASSESSED' : !pass ? 'NOT_READY' : s.findings.some(f => f.status === 'deferred') ? 'CONDITIONALLY_READY' : 'READY',
    qualification: 'Readiness is limited to declared Git scope and configured automated checks; not proof of zero defects, usability or unavailable real-world hardware behavior.' };
}
