import { hash } from './io.mjs';
import { TERMINAL_TASK } from './scheduler.mjs';
export const MODES = ['audit', 'plan', 'remediate', 'verify', 'full'];

export function coverage(s, snap = s.inventory) {
  if (!snap) return { reviewed: 0, total: 0, remaining: [] };
  const remaining = snap.files.filter(f => s.coverage[f.path]?.hash !== f.hash || s.coverage[f.path]?.kind !== f.kind || s.coverage[f.path]?.executable !== f.executable);
  return { reviewed: snap.files.length - remaining.length, total: snap.files.length, remaining: remaining.map(f => f.path) };
}

export function latestRun(s, check, contextHash = null) {
  const runs = s.runs.filter(r => r.checkId === check.id && (contextHash == null || r.contextHash === contextHash));
  return runs.at(-1);
}

export function runIsFresh(run, check, snap, state = null) {
  if (!run || run.integrity === false || run.status !== 'PASS' || run.specHash !== check.specHash || run.snapshot !== snap.digest || run.afterSnapshot !== snap.digest) return false;
  if (state && latestRun(state, check, run.contextHash)?.id !== run.id) return false;
  return true;
}

export function reviewIsFresh(review, snap) {
  return review?.snapshot === snap.digest && review.verdict === 'approve' && review.reviewer !== review.implementer;
}

export function effectiveReviews(s, snap, { scope = null, findingId = null } = {}) {
  return s.reviews.filter(review => review.snapshot === snap.digest && (!scope || review.scope === scope) && (!findingId || review.scope === 'final' || review.findingIds?.includes(findingId)));
}

export function unresolvedReviewObjections(s, snap, scope = 'final') {
  const reviews = effectiveReviews(s, snap, { scope });
  return reviews.filter(review => review.verdict === 'changes_required' && !reviews.some(candidate => candidate.verdict === 'approve' && candidate.supersedes?.includes(review.id)));
}

export function finalReviewPasses(s, snap) {
  const reviews = effectiveReviews(s, snap, { scope: 'final' });
  return reviews.some(review => review.verdict === 'approve' && review.reviewer !== review.implementer) && unresolvedReviewObjections(s, snap).length === 0;
}

export function contractHash(s) { return hash(s.checks.map(c => ({ id: c.id, specHash: c.specHash, required: c.required }))); }

function planCoverage(s) {
  const actions = s.planActions ?? [];
  const mapped = new Set(actions.map(action => action.findingId));
  return s.findings.filter(f => !['verified', 'dismissed', 'deferred'].includes(f.status) && !mapped.has(f.id)).map(f => f.id);
}

export function evaluate(s, snap, { final = true } = {}) {
  const c = coverage(s, snap), criteria = [];
  const add = (id, passed, detail) => criteria.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  add('inventory', snap.files.length > 0 && s.inventory?.digest === snap.digest, { files: snap.files.length, current: s.inventory?.digest === snap.digest, scope: s.scope ?? s.options?.scope ?? null });
  add('review-coverage', c.total > 0 && c.reviewed === c.total, c);
  const unknownBoundaries = snap.files.filter(f => ['external-tree', 'special'].includes(f.kind) && s.boundaries[f.path]?.hash !== f.hash);
  add('scope-boundaries', unknownBoundaries.length === 0, unknownBoundaries.map(f => f.path));
  add('no-active-workers', !s.tasks.some(t => t.status === 'running') && !s.checkBatch, 'Settle all native workers and running command batches before completing a phase.');
  if (s.mode === 'audit') {
    add('audit-tasks-settled', s.tasks.every(t => t.status === 'done'), s.tasks.filter(t => t.status !== 'done').map(t => t.id));
    return result(s, criteria, snap, false);
  }
  add('verification-contract', s.contract.sealed && s.contract.hash === contractHash(s), { sealed: s.contract.sealed, note: s.contract.note });
  add('automated-tests-defined', s.checks.some(x => x.required && ['tests', 'validation'].includes(x.category)), 'At least one required executable test/validation check; no invented universal coverage target.');
  if (s.mode === 'plan') {
    const uncovered = planCoverage(s);
    add('plan-action-coverage', uncovered.length === 0, uncovered);
    return result(s, criteria, snap, false);
  }
  const undecided = s.findings.filter(f => !['verified', 'dismissed', 'deferred'].includes(f.status));
  const badDeferrals = s.findings.filter(f => f.status === 'deferred' && (f.releaseBlocking || ['critical', 'high'].includes(f.severity)));
  const staleDismissals = s.findings.filter(f => f.status === 'dismissed' && f.releaseBlocking && f.dispositionSnapshot !== snap.digest);
  add('dismissal-evidence-current', staleDismissals.length === 0, staleDismissals.map(f => f.id));
  const staleFindings = s.findings.filter(f => f.status === 'verified' && (f.verifiedSnapshot !== snap.digest || !f.evidenceIds?.length || !f.evidenceIds.every(id => {
    const r = s.runs.find(x => x.id === id), ck = r && s.checks.find(x => x.id === r.checkId);
    return ck && runIsFresh(r, ck, snap, s);
  })));
  add('finding-disposition', undecided.length === 0 && badDeferrals.length === 0, [...undecided, ...badDeferrals].map(f => f.id));
  add('fix-evidence-current', staleFindings.length === 0, staleFindings.map(f => f.id));
  const unfinished = s.tasks.filter(t => !TERMINAL_TASK.has(t.status));
  add('tasks-settled', unfinished.length === 0 && !s.checkBatch, unfinished.map(t => ({ id: t.id, status: t.status })));
  const checks = s.checks.filter(x => x.required).map(check => {
    const last = latestRun(s, check);
    return { id: check.id, passed: runIsFresh(last, check, snap, s), last: last?.status ?? 'NOT_RUN', integrity: last?.integrityReason ?? 'not checked' };
  });
  add('mandatory-checks', checks.length > 0 && checks.every(x => x.passed), checks);
  if (final) {
    const objections = unresolvedReviewObjections(s, snap);
    add('independent-final-review', finalReviewPasses(s, snap), { objections: objections.map(review => review.id), reviews: effectiveReviews(s, snap, { scope: 'final' }).map(review => ({ id: review.id, verdict: review.verdict, reviewer: review.reviewer, supersedes: review.supersedes ?? [] })) });
    add('candidate-stage', s.stage === 'release-candidate', s.stage);
  }
  return result(s, criteria, snap, true);
}

function result(s, criteria, snap, assessesRelease) {
  const pass = criteria.every(c => c.status === 'PASS');
  const readiness = !assessesRelease ? 'NOT_ASSESSED' : !pass ? 'NOT_READY' : s.findings.some(f => f.status === 'deferred') ? 'CONDITIONALLY_READY' : 'READY';
  return { evaluatedSnapshot: snap.digest, mode: s.mode, stage: s.stage, allPassed: pass,
    criteria, passed: criteria.filter(c => c.status === 'PASS').length, total: criteria.length, readiness,
    outcome: s.outcome ?? null, qualification: 'Readiness is limited to declared Git scope and configured automated checks; not proof of zero defects, usability or unavailable real-world hardware behavior.' };
}
