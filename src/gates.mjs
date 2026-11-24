import { hash } from './io.mjs';
import { TERMINAL_TASK } from './scheduler.mjs';
export const MODES = ['audit', 'plan', 'remediate', 'verify', 'full'];

export function coverage(s, snap = s.inventory) {
  if (!snap) return { reviewed: 0, total: 0, remaining: [] };
  const remaining = snap.files.filter(f => s.coverage[f.path]?.hash !== f.hash || s.coverage[f.path]?.kind !== f.kind || s.coverage[f.path]?.executable !== f.executable);
  return { reviewed: snap.files.length - remaining.length, total: snap.files.length, remaining: remaining.map(f => f.path) };
}

export function latestRun(s, check) {
  return s.runs.filter(r => r.checkId === check.id && r.specHash === check.specHash && (r.contextKey ?? check.contextKey ?? 'default') === (check.contextKey ?? 'default')).at(-1);
}

export function runIsFresh(run, check, snap) {
  return !!run && run.integrity !== false && run.status === 'PASS' &&
    run.specHash === check.specHash &&
    (run.contextKey ?? check.contextKey ?? 'default') === (check.contextKey ?? 'default') &&
    run.snapshot === snap.digest && run.afterSnapshot === snap.digest;
}

function reviewKey(review) {
  return review.subjectKey ?? hash({
    scope: review.scope,
    snapshot: review.snapshot,
    contractRevision: review.contractRevision ?? null,
    findingIds: [...(review.findingIds ?? [])].sort(),
  });
}

function applicableReviews(s, snap, scope, findingId) {
  const reviews = s.reviews.filter(r =>
    r.snapshot === snap.digest &&
    (r.scope === scope || (scope === 'final' && r.scope === 'final')) &&
    (scope === 'final' || r.scope === 'final' || r.findingIds?.includes(findingId)),
  );
  const latest = new Map();
  for (const review of reviews) {
    const key = `${review.reviewer}|${reviewKey(review)}`;
    latest.set(key, review);
  }
  return [...latest.values()];
}

export function reviewIsFresh(review, snap, s) {
  if (!review || review.snapshot !== snap.digest || review.verdict !== 'approve' || review.reviewer === review.implementer) return false;
  if (s && review.contractRevision !== undefined && review.contractRevision !== s.contract.revision) return false;
  if (s && applicableReviews(s, snap, review.scope, review.findingIds?.[0]).find(r => r.id === review.id) === undefined) return false;
  return true;
}

export function reviewAllows(s, snap, scope, findingId) {
  const reviews = applicableReviews(s, snap, scope, findingId);
  return reviews.some(r => r.verdict === 'approve' && reviewIsFresh(r, snap, s)) &&
    !reviews.some(r => r.verdict === 'changes_required');
}

export function contractHash(s) {
  return hash(s.checks.map(c => ({ id: c.id, specHash: c.specHash, required: c.required, contextKey: c.contextKey ?? 'default' })));
}

function planActionCoverage(s) {
  const uncovered = s.findings.filter(f =>
    !['verified', 'dismissed', 'deferred'].includes(f.status) &&
    !f.planCoverage?.kind,
  );
  return { covered: uncovered.length === 0, uncovered: uncovered.map(f => f.id) };
}

export function evaluate(s, snap, { final = true } = {}) {
  const c = coverage(s, snap), criteria = [];
  const add = (id, passed, detail) => criteria.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  add('inventory', snap.files.length > 0 && s.inventory?.digest === snap.digest, { files: snap.files.length, current: s.inventory?.digest === snap.digest });
  add('review-coverage', c.total > 0 && c.reviewed === c.total, c);
  // Integration review is NOT a recursive audit of an external submodule.
  const unknownBoundaries = snap.files.filter(f => ['external-tree', 'special'].includes(f.kind) && s.boundaries[f.path]?.hash !== f.hash);
  add('scope-boundaries', unknownBoundaries.length === 0, unknownBoundaries.map(f => f.path));
  add('no-active-workers', !s.tasks.some(t => t.status === 'running') && !s.checkBatch, 'Settle all native workers and running command batches before completing phase.');
  if (s.mode === 'audit') add('audit-tasks-settled', s.tasks.every(t => t.status === 'done'), s.tasks.filter(t => t.status !== 'done').map(t => t.id));
  if (s.mode === 'audit') return result(s, criteria, snap, false);
  add('verification-contract', s.contract.sealed && s.contract.hash === contractHash(s), { sealed: s.contract.sealed, note: s.contract.note });
  add('automated-tests-defined', s.checks.some(x => x.required && ['tests', 'validation'].includes(x.category)), 'At least one required executable test/validation check; no invented universal coverage target.');
  if (s.mode === 'plan') {
    add('plan-action-coverage', planActionCoverage(s).covered, planActionCoverage(s).uncovered);
    return result(s, criteria, snap, false);
  }
  const undecided = s.findings.filter(f => !['verified', 'dismissed', 'deferred'].includes(f.status));
  const badDeferrals = s.findings.filter(f => f.status === 'deferred' && (f.releaseBlocking || ['critical', 'high'].includes(f.severity)));
  const staleDismissals = s.findings.filter(f => f.status === 'dismissed' && f.releaseBlocking && f.dispositionSnapshot !== snap.digest);
  add('dismissal-evidence-current', staleDismissals.length === 0, staleDismissals.map(f => f.id));
  const staleFindings = s.findings.filter(f => f.status === 'verified' && (
    f.verifiedSnapshot !== snap.digest ||
    !f.evidenceIds?.length ||
    !f.evidenceIds.every(id => {
      const r = s.runs.find(x => x.id === id);
      const ck = r && s.checks.find(x => x.id === r.checkId);
      return ck && latestRun(s, ck)?.id === r.id && runIsFresh(r, ck, snap);
    })
  ));
  add('finding-disposition', undecided.length === 0 && badDeferrals.length === 0, [...undecided, ...badDeferrals].map(f => f.id));
  add('fix-evidence-current', staleFindings.length === 0, staleFindings.map(f => f.id));
  const unfinished = s.tasks.filter(t => !TERMINAL_TASK.has(t.status));
  add('tasks-settled', unfinished.length === 0 && !s.checkBatch, unfinished.map(t => ({ id: t.id, status: t.status })));
  const checks = s.checks.filter(x => x.required).map(check => {
    const last = latestRun(s, check);
    return { id: check.id, passed: runIsFresh(last, check, snap), last: last?.status ?? 'NOT_RUN', integrity: last?.integrityReason ?? 'not checked' };
  });
  add('mandatory-checks', checks.length > 0 && checks.every(x => x.passed), checks);
  if (final) {
    const finalReviews = applicableReviews(s, snap, 'final');
    add('independent-final-review', reviewAllows(s, snap, 'final'), finalReviews.length ? finalReviews : 'A separate reviewer context must assess current snapshot; remains recorded agent attestation, not cryptographic identity claim.');
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
