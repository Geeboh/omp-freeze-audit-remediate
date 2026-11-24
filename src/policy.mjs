import { hash, requireThat, text, now } from './io.mjs';

export const ESCALATION_MODES = ['never', 'shelve', 'ask', 'always'];
export const ESCALATION_STATES = ['PROPOSED', 'DENIED', 'SHELVED', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCH_RESERVED', 'RUNNING', 'RECONCILING', 'SETTLED', 'EXPIRED', 'REVOKED', 'INVALIDATED'];

const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}`);
  return value;
};

function copy(value) { return structuredClone(value); }

export const DEFAULT_POLICY = Object.freeze({
  schemaVersion: 2,
  revision: 1,
  source: { kind: 'built-in', eventId: null },
  profile: 'balanced',
  execution: {
    baselineProvider: 'current', baselineModel: 'current', baselineEffort: 'current', maxWorkers: 4,
    isolatedWorkers: true, continueIndependentWork: true, workerTimeoutSeconds: 1800,
    maxCallsPerAttempt: 12, maxInputTokensPerCall: 64000, maxOutputTokensPerCall: 8000,
  },
  escalation: {
    mode: 'shelve', onApprovalUnavailable: 'shelve', maxApprovedUpgradesPerTask: 1,
    maxReconsiderationsPerTask: 2, approvalTtlSeconds: 3600, reconsiderOn: 'relevant-evidence-change',
    autoResumeAfterApproval: false, allowedTargets: [],
  },
  budgets: {
    run: { maxWallTimeSeconds: 14400, maxModelCalls: 120, maxInputTokens: 2000000, maxOutputTokens: 120000, maxCostMicro: null },
    escalation: { maxConcurrentWorkers: 1, maxAdditionalInputTokens: 200000, maxAdditionalOutputTokens: 20000, maxAdditionalCostMicro: null },
    unknownCost: 'block-cost-capped-dispatch', stopBehavior: 'cancel-owned',
  },
  scope: { include: ['.'], exclude: [], since: null, includeWorkingTree: true, dependencyMode: 'conservative', freezeAdmission: true },
  convergence: { maxWaves: 8, maxNoProgressWaves: 3, maxSameFailureAttempts: 2, maxStabilizationPasses: 5, maxDiagnosticPasses: 1, stateHistoryWindow: 8 },
  verification: { localReuse: 'explicit-input-manifest', unknownDependency: 'expand', fullCandidateChecks: true, strictReviewPrecedence: true },
});

export function normalizePolicy(input = {}, base = DEFAULT_POLICY) {
  const candidate = copy(base);
  const source = input.policy ?? input;
  if (source.profile !== undefined) candidate.profile = typeof source.profile === 'string' ? source.profile : { ...candidate.profile, ...source.profile };
  for (const key of ['scope', 'convergence', 'verification']) if (source[key] !== undefined) candidate[key] = { ...candidate[key], ...source[key] };
  if (source.execution) candidate.execution = { ...candidate.execution, ...source.execution };
  if (source.escalation) candidate.escalation = { ...candidate.escalation, ...source.escalation };
  if (source.budgets) candidate.budgets = { ...candidate.budgets, ...source.budgets, run: { ...candidate.budgets.run, ...(source.budgets.run ?? {}) }, escalation: { ...candidate.budgets.escalation, ...(source.budgets.escalation ?? {}) } };
  if (source.escalationMode) candidate.escalation.mode = source.escalationMode;
  requireThat(['quick', 'balanced', 'release'].includes(candidate.profile), 'Invalid policy profile');
  requireThat(ESCALATION_MODES.includes(candidate.escalation.mode), 'Invalid escalation mode');
  requireThat(ESCALATION_MODES.includes(candidate.escalation.onApprovalUnavailable), 'Invalid approval-unavailable policy');
  integer(candidate.execution.maxWorkers, 'maxWorkers', 1, 32);
  integer(candidate.execution.maxCallsPerAttempt, 'maxCallsPerAttempt', 1, 200);
  integer(candidate.execution.maxInputTokensPerCall, 'maxInputTokensPerCall', 1);
  integer(candidate.execution.maxOutputTokensPerCall, 'maxOutputTokensPerCall', 1);
  integer(candidate.escalation.maxApprovedUpgradesPerTask, 'maxApprovedUpgradesPerTask', 0);
  integer(candidate.escalation.maxReconsiderationsPerTask, 'maxReconsiderationsPerTask', 0);
  integer(candidate.escalation.approvalTtlSeconds, 'approvalTtlSeconds', 1);
  return candidate;
}

export function envelope(input) {
  const out = {
    provider: text(input.provider, 'provider', 300), model: text(input.model, 'model', 300), effort: text(input.effort, 'effort', 100),
    maxCalls: integer(input.maxCalls ?? 1, 'maxCalls', 1), maxInputTokens: integer(input.maxInputTokens ?? 0, 'maxInputTokens'),
    maxOutputTokens: integer(input.maxOutputTokens ?? 0, 'maxOutputTokens'), maxWorkers: integer(input.maxWorkers ?? 1, 'maxWorkers', 1, 32),
  };
  return Object.freeze(out);
}

export function envelopeWithin(candidate, approved) {
  return candidate.provider === approved.provider && candidate.model === approved.model && candidate.effort === approved.effort &&
    candidate.maxCalls <= approved.maxCalls && candidate.maxInputTokens <= approved.maxInputTokens &&
    candidate.maxOutputTokens <= approved.maxOutputTokens && candidate.maxWorkers <= approved.maxWorkers;
}

export function proposal(input) {
  const body = {
    kind: 'far-escalation-proposal', schemaVersion: 2, runId: text(input.runId, 'runId', 200), taskId: text(input.taskId, 'taskId', 200),
    taskRevision: integer(input.taskRevision ?? 0, 'taskRevision'), baseline: envelope(input.baseline), requested: envelope(input.requested),
    objective: text(input.objective, 'objective', 2000), reason: text(input.reason, 'reason', 4000), scopeFingerprint: text(input.scopeFingerprint, 'scopeFingerprint', 200),
    policyRevision: integer(input.policyRevision ?? 1, 'policyRevision'), evidence: [...(input.evidence ?? [])].map(x => text(x, 'evidence', 300)),
    createdAt: input.createdAt ?? now(),
  };
  return { ...body, digest: hash(body), state: 'PROPOSED', decisionHistory: [] };
}

export function decideEscalation({ policy, proposal: request, host = {}, grant = null, budget = null, trustedApprovalChannel = false }) {
  const p = normalizePolicy(policy);
  const within = envelopeWithin(request.requested, request.baseline);
  if (within) return { decision: 'ALLOW_BASELINE', state: 'APPROVED', reason: 'Requested route remains inside the approved baseline envelope.', requiresHostEnforcement: false };
  if (p.escalation.mode === 'never') return { decision: 'DENY', state: 'DENIED', reason: 'Escalation policy is never.', requiresHostEnforcement: true };
  if (!host.enforcement) return { decision: 'SHELVE', state: 'SHELVED', reason: 'Host cannot prove exact route and envelope enforcement.', requiresHostEnforcement: true };
  if (grant) {
    requireThat(grant.proposalDigest === request.digest, 'Approval grant does not match the immutable proposal', 'APPROVAL_MISMATCH');
    requireThat(grant.state === 'APPROVED' && grant.used < grant.maxUses && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()), 'Approval grant is unavailable', 'APPROVAL_UNAVAILABLE');
    return { decision: 'ALLOW_GRANT', state: 'APPROVED', reason: 'Matching trusted approval grant is available.', grantId: grant.id, requiresHostEnforcement: true };
  }
  if (!p.escalation.allowedTargets.some(target => target.provider === request.requested.provider && target.model === request.requested.model && target.effort === request.requested.effort)) {
    return { decision: 'DENY', state: 'DENIED', reason: 'Requested route is not in the explicit escalation allowlist.', requiresHostEnforcement: true };
  }
  if (budget?.available === false) return { decision: 'DENY', state: 'DENIED', reason: 'Applicable resource budget cannot cover the proposal.', requiresHostEnforcement: true };
  if (p.escalation.mode === 'shelve') return { decision: 'SHELVE', state: 'SHELVED', reason: 'Escalation policy shelves upgrades.', requiresHostEnforcement: true };
  if (p.escalation.mode === 'ask') return trustedApprovalChannel
    ? { decision: 'REQUEST_APPROVAL', state: 'PENDING_APPROVAL', reason: 'Trusted approval is required for this upgrade.', requiresHostEnforcement: true }
    : { decision: 'SHELVE', state: 'SHELVED', reason: 'Trusted approval channel is unavailable.', requiresHostEnforcement: true };
  return { decision: 'ALLOW_POLICY', state: 'APPROVED', reason: 'Always policy allows this allowlisted upgrade under the approved envelope.', requiresHostEnforcement: true };
}

export function approve(proposalRecord, { source, digest, maxUses = 1, expiresAt = null, limits = {} } = {}) {
  requireThat(source === 'trusted-user', 'Only a trusted user control event can approve an escalation', 'UNTRUSTED_APPROVAL');
  requireThat(digest === proposalRecord.digest, 'Approval must bind the exact immutable proposal digest', 'APPROVAL_MISMATCH');
  integer(maxUses, 'maxUses', 1, 1);
  return { id: `G-${hash({ digest, source, maxUses, expiresAt }).slice(0, 24)}`, proposalDigest: digest, source, maxUses, used: 0, expiresAt, limits: copy(limits), state: 'APPROVED', createdAt: now() };
}

export function consumeGrant(grant, digest) {
  requireThat(grant.proposalDigest === digest, 'Grant digest mismatch', 'APPROVAL_MISMATCH');
  requireThat(grant.state === 'APPROVED' && grant.used < grant.maxUses && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()), 'Grant is expired, revoked, or already used', 'APPROVAL_UNAVAILABLE');
  return { ...grant, used: grant.used + 1, state: grant.used + 1 >= grant.maxUses ? 'DISPATCH_RESERVED' : 'APPROVED' };
}

export function emptyBudget(policy) {
  const p = normalizePolicy(policy);
  const limits = p.budgets.run;
  return { limits: { calls: limits.maxModelCalls, inputTokens: limits.maxInputTokens, outputTokens: limits.maxOutputTokens, costMicro: limits.maxCostMicro }, settled: { calls: 0, inputTokens: 0, outputTokens: 0, costMicro: 0 }, reserved: { calls: 0, inputTokens: 0, outputTokens: 0, costMicro: 0 }, concurrent: { limit: p.budgets.escalation.maxConcurrentWorkers, used: 0 }, reservations: [] };
}

function resourceTotal(budget, key) { return (budget.settled[key] ?? 0) + (budget.reserved[key] ?? 0); }
function resourceLimit(budget, key) { return budget.limits[key]; }

export function reserve(budget, request, reservationKey) {
  const existing = budget.reservations.find(r => r.key === reservationKey);
  if (existing) {
    requireThat(existing.requestDigest === request.digest, 'Reservation key was reused for a different request', 'IDEMPOTENCY_MISMATCH');
    return { budget: copy(budget), reservation: existing, replayed: true };
  }
  const usage = { calls: request.maxCalls, inputTokens: request.maxInputTokens, outputTokens: request.maxOutputTokens, costMicro: request.maxCostMicro ?? 0 };
  for (const key of ['calls', 'inputTokens', 'outputTokens']) requireThat(resourceLimit(budget, key) === null || resourceTotal(budget, key) + usage[key] <= resourceLimit(budget, key), `Budget exhausted for ${key}`, 'BUDGET_EXHAUSTED');
  requireThat(budget.concurrent.used < budget.concurrent.limit, 'Escalation worker slot exhausted', 'SLOT_EXHAUSTED');
  const next = copy(budget);
  for (const key of ['calls', 'inputTokens', 'outputTokens', 'costMicro']) next.reserved[key] += usage[key];
  next.concurrent.used += 1;
  const reservation = { key: reservationKey, requestDigest: request.digest, usage, state: 'RESERVED', createdAt: now() };
  next.reservations.push(reservation);
  return { budget: next, reservation, replayed: false };
}

export function settleReservation(budget, reservationKey, actual = {}, state = 'SETTLED') {
  const current = budget.reservations.find(r => r.key === reservationKey);
  requireThat(current, 'Unknown resource reservation', 'RESERVATION_UNKNOWN');
  if (current.state === 'SETTLED' || current.state === 'RECONCILING') return { budget: copy(budget), reservation: current, replayed: true };
  const next = copy(budget), usage = { ...current.usage, ...actual };
  for (const key of ['calls', 'inputTokens', 'outputTokens', 'costMicro']) {
    next.reserved[key] -= current.usage[key];
    next.settled[key] += usage[key];
  }
  next.concurrent.used = Math.max(0, next.concurrent.used - 1);
  const reservation = { ...current, actual: usage, state, settledAt: now() };
  next.reservations = next.reservations.map(item => item.key === reservationKey ? reservation : item);
  return { budget: next, reservation, replayed: false };
}
