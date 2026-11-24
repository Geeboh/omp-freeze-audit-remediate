/** Pure escalation, approval, envelope and fixed-point budget policy. */
import { createHash, randomUUID } from 'node:crypto';

export const ESCALATION_POLICIES = ['never', 'shelve', 'ask', 'always'];
export const REQUEST_STATES = ['PROPOSED', 'DENIED', 'SHELVED', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCH_RESERVED', 'RUNNING', 'RECONCILING', 'SETTLED', 'EXPIRED', 'REVOKED', 'INVALIDATED'];
export const TRUSTED_APPROVAL_ORIGINS = new Set(['user-command', 'host-user', 'trusted-control']);
export const POLICY_SCHEMA_VERSION = 1;

const integer = (value, label, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return value;
};

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function normaliseEnvelope(input = {}) {
  const envelope = {
    provider: input.provider ?? null,
    model: input.model ?? null,
    effort: input.effort ?? null,
    maxInputTokens: input.maxInputTokens == null ? null : integer(input.maxInputTokens, 'maxInputTokens'),
    maxOutputTokens: input.maxOutputTokens == null ? null : integer(input.maxOutputTokens, 'maxOutputTokens'),
    maxCalls: input.maxCalls == null ? null : integer(input.maxCalls, 'maxCalls'),
    maxConcurrentWorkers: input.maxConcurrentWorkers == null ? 1 : integer(input.maxConcurrentWorkers, 'maxConcurrentWorkers', 1),
    allowedProviders: [...new Set(input.allowedProviders ?? [])],
    allowedModels: [...new Set(input.allowedModels ?? [])],
    allowedEfforts: [...new Set(input.allowedEfforts ?? [])],
    dataHandling: input.dataHandling ?? 'host-default'
  };
  return { ...envelope, digest: digest(envelope) };
}

export function defaultBudgets(input = {}) {
  const limit = (name, fallback) => input[name] == null ? fallback : integer(input[name], name);
  return {
    calls: { limit: limit('maxCalls', 0), settled: integer(input.callsSettled ?? 0, 'callsSettled'), reserved: integer(input.callsReserved ?? 0, 'callsReserved') },
    tokens: { limit: limit('maxTokens', 0), settled: integer(input.tokensSettled ?? 0, 'tokensSettled'), reserved: integer(input.tokensReserved ?? 0, 'tokensReserved') },
    microUnits: { limit: limit('maxMicroUnits', 0), settled: integer(input.microUnitsSettled ?? 0, 'microUnitsSettled'), reserved: integer(input.microUnitsReserved ?? 0, 'microUnitsReserved') },
    slots: { limit: limit('maxConcurrentWorkers', 1), settled: integer(input.slotsSettled ?? 0, 'slotsSettled'), reserved: integer(input.slotsReserved ?? 0, 'slotsReserved') }
  };
}

export function createPolicy(input = {}) {
  const mode = input.mode ?? 'shelve';
  if (!ESCALATION_POLICIES.includes(mode)) throw new Error(`Invalid escalation policy ${mode}`);
  const envelope = normaliseEnvelope(input.envelope ?? {});
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    mode,
    source: input.source ?? 'builtin',
    revision: integer(input.revision ?? 1, 'policy revision', 1),
    envelope,
    budgets: input.budgets ? cloneBudgets(input.budgets) : defaultBudgets({ ...input, maxConcurrentWorkers: envelope.maxConcurrentWorkers }),
    approvedUpgradedAttemptsPerTask: integer(input.approvedUpgradedAttemptsPerTask ?? 1, 'approvedUpgradedAttemptsPerTask', 1),
    maxConcurrentUpgradedWorkers: integer(input.maxConcurrentUpgradedWorkers ?? 1, 'maxConcurrentUpgradedWorkers', 1),
    approvalLifetimeSeconds: integer(input.approvalLifetimeSeconds ?? 3600, 'approvalLifetimeSeconds', 1),
    allowedTargets: [...new Set(input.allowedTargets ?? [])],
    hostCapabilities: { ...(input.hostCapabilities ?? {}) }
  };
}

export function cloneBudgets(budgets) {
  const out = {};
  for (const name of ['calls', 'tokens', 'microUnits', 'slots']) {
    const b = budgets?.[name] ?? {};
    out[name] = { limit: integer(b.limit ?? 0, `${name}.limit`), settled: integer(b.settled ?? 0, `${name}.settled`), reserved: integer(b.reserved ?? 0, `${name}.reserved`) };
  }
  return out;
}

export function remainingBudget(budget, name) {
  const b = budget?.[name];
  if (!b) throw new Error(`Unknown budget ${name}`);
  return b.limit === 0 ? null : b.limit - b.settled - b.reserved;
}

export function reserveBudget(budgets, amount = {}) {
  const next = cloneBudgets(budgets);
  for (const name of ['calls', 'tokens', 'microUnits', 'slots']) {
    const value = integer(amount[name] ?? 0, `${name} reservation`);
    const available = remainingBudget(next, name);
    if (available !== null && value > available) throw new Error(`Insufficient ${name} budget`);
    next[name].reserved += value;
  }
  return next;
}

export function settleBudget(budgets, reservation = {}, actual = {}, { uncertain = false } = {}) {
  const next = cloneBudgets(budgets);
  for (const name of ['calls', 'tokens', 'microUnits', 'slots']) {
    const reserved = integer(reservation[name] ?? 0, `${name} reservation`);
    const used = actual[name] == null ? (uncertain ? reserved : 0) : integer(actual[name], `${name} usage`);
    if (reserved > next[name].reserved) throw new Error(`Cannot settle more ${name} than reserved`);
    next[name].reserved -= reserved;
    next[name].settled += name === 'slots' ? 0 : used;
  }
  return next;
}

export function makeProposal({ runId, taskId, taskRevision = 0, problem = {}, baseline, proposed, scope = {}, evidence = [], alternatives = [], resourceEstimate = {}, policyRevision = 1 }) {
  const body = {
    runId, taskId, taskRevision, problem, baseline: normaliseEnvelope(baseline), proposed: normaliseEnvelope(proposed), scope,
    evidence, alternatives, resourceEstimate, policyRevision
  };
  const proposal = { requestId: `X-${randomUUID()}`, requestRevision: 1, state: 'PROPOSED', ...body };
  proposal.proposalDigest = digest({ ...proposal, requestId: undefined });
  return proposal;
}

function routeAllowed(policy, route) {
  const e = policy.envelope;
  if (e.allowedProviders.length && route.provider && !e.allowedProviders.includes(route.provider)) return false;
  if (e.allowedModels.length && route.model && !e.allowedModels.includes(route.model)) return false;
  if (e.allowedEfforts.length && route.effort && !e.allowedEfforts.includes(route.effort)) return false;
  if (policy.allowedTargets.length && route.model && !policy.allowedTargets.includes(route.model)) return false;
  return true;
}

function exceedsEnvelope(baseline, proposed) {
  const exact = ['provider', 'model', 'effort'];
  if (exact.some(key => baseline[key] !== proposed[key])) return true;
  for (const key of ['maxInputTokens', 'maxOutputTokens', 'maxCalls']) if (proposed[key] != null && (baseline[key] == null || proposed[key] > baseline[key])) return true;
  return false;
}

export function decideEscalation({ policy, proposal, hostCapabilities = policy?.hostCapabilities ?? {}, grant = null }) {
  if (!policy || !proposal) throw new Error('Policy and proposal are required');
  if (!routeAllowed(policy, proposal.proposed)) return { decision: 'DENIED', state: 'DENIED', reason: 'route-not-allowlisted' };
  if (!exceedsEnvelope(proposal.baseline, proposal.proposed)) return { decision: 'BASELINE', state: 'APPROVED', reason: 'inside-approved-envelope' };
  if (grant && grant.proposalDigest === proposal.proposalDigest && grant.state === 'APPROVED') return { decision: 'GRANT', state: 'APPROVED', reason: 'matching-trusted-grant' };
  if (policy.mode === 'never') return { decision: 'DENY', state: 'DENIED', reason: 'policy-never' };
  if (hostCapabilities.enforcementSupported !== true) return { decision: 'SHELVE', state: 'SHELVED', reason: 'host-enforcement-unavailable' };
  if (policy.mode === 'shelve') return { decision: 'SHELVE', state: 'SHELVED', reason: 'policy-shelve' };
  if (policy.mode === 'ask') return { decision: 'ASK', state: 'PENDING_APPROVAL', reason: 'trusted-approval-required' };
  if (policy.mode === 'always') return { decision: 'GRANT', state: 'APPROVED', reason: 'policy-always-within-host-capabilities' };
  throw new Error(`Unhandled escalation policy ${policy.mode}`);
}

export function makeApproval({ proposal, origin, actor, now = Date.now(), lifetimeSeconds = 3600, maxUses = 1, limits = {} }) {
  if (!TRUSTED_APPROVAL_ORIGINS.has(origin)) throw new Error('Approval requires a trusted user/control origin');
  if (!proposal?.proposalDigest) throw new Error('Approval requires an immutable proposal digest');
  const uses = integer(maxUses, 'maxUses', 1);
  return {
    approvalId: `A-${randomUUID()}`, proposalDigest: proposal.proposalDigest, proposalRevision: proposal.requestRevision,
    state: 'APPROVED', origin, actor, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + lifetimeSeconds * 1000).toISOString(),
    maxUses: uses, usesConsumed: 0, limits: { ...limits }
  };
}

export function consumeApproval(approval, proposal, { now = Date.now(), scopeDigest = null } = {}) {
  if (!approval || approval.state !== 'APPROVED') throw new Error('Approval is not active');
  if (approval.proposalDigest !== proposal.proposalDigest || approval.proposalRevision !== proposal.requestRevision) throw new Error('Approval proposal revision mismatch');
  if (Date.parse(approval.expiresAt) <= now) throw new Error('Approval expired');
  if (approval.usesConsumed >= approval.maxUses) throw new Error('Approval already used');
  if (approval.limits.scopeDigest && approval.limits.scopeDigest !== scopeDigest) throw new Error('Approval scope mismatch');
  return { ...approval, usesConsumed: approval.usesConsumed + 1, state: 'DISPATCH_RESERVED' };
}

export function dependencyOutcome(status, condition = 'requires_result') {
  if (condition === 'after_completion') return ['done', 'failed', 'blocked', 'deferred', 'shelved', 'denied', 'cancelled'].includes(status);
  if (condition === 'requires_patch') return ['integrated', 'verified', 'done'].includes(status);
  if (condition === 'requires_check') return status === 'verified';
  return status === 'done' || status === 'verified';
}
