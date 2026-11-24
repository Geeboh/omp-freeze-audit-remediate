import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, approve, decideEscalation, emptyBudget, envelope, normalizePolicy, proposal, reserve, settleReservation, consumeGrant } from '../src/policy.mjs';

const baseline = envelope({ provider: 'fixture', model: 'base', effort: 'standard', maxCalls: 2, maxInputTokens: 100, maxOutputTokens: 50, maxWorkers: 1 });
const requested = envelope({ provider: 'fixture', model: 'deep', effort: 'high', maxCalls: 1, maxInputTokens: 20, maxOutputTokens: 10, maxWorkers: 1 });
const request = () => proposal({ runId: 'run-1', taskId: 'task-1', taskRevision: 1, baseline, requested, objective: 'repair fixture', reason: 'two distinct failures', scopeFingerprint: 'scope-1' });

test('new policy defaults to shelve and accepts all four modes', () => {
  assert.equal(DEFAULT_POLICY.escalation.mode, 'shelve');
  for (const mode of ['never', 'shelve', 'ask', 'always']) assert.equal(normalizePolicy({ escalationMode: mode }).escalation.mode, mode);
});

test('policy decisions never dispatch unapproved upgrades', () => {
  const p = request();
  for (const mode of ['never', 'shelve']) {
    const result = decideEscalation({ policy: normalizePolicy({ escalationMode: mode, escalation: { allowedTargets: [{ provider: 'fixture', model: 'deep', effort: 'high' }] } }), proposal: p, host: { enforcement: true } });
    assert.equal(result.state, mode === 'never' ? 'DENIED' : 'SHELVED');
  }
  assert.equal(decideEscalation({ policy: normalizePolicy({ escalationMode: 'ask', escalation: { allowedTargets: [{ provider: 'fixture', model: 'deep', effort: 'high' }] } }), proposal: p, host: { enforcement: true }, trustedApprovalChannel: true }).state, 'PENDING_APPROVAL');
  assert.equal(decideEscalation({ policy: normalizePolicy({ escalationMode: 'always', escalation: { allowedTargets: [{ provider: 'fixture', model: 'deep', effort: 'high' }] } }), proposal: p, host: { enforcement: true } }).state, 'APPROVED');
});

test('host without enforcement shelves escalation instead of claiming control', () => {
  const p = request();
  const result = decideEscalation({ policy: normalizePolicy({ escalationMode: 'always', escalation: { allowedTargets: [{ provider: 'fixture', model: 'deep', effort: 'high' }] } }), proposal: p, host: { enforcement: false } });
  assert.equal(result.state, 'SHELVED');
  assert.match(result.reason, /enforcement/i);
});

test('approval binds exact proposal and is one-use', () => {
  const p = request();
  const grant = approve(p, { source: 'trusted-user', digest: p.digest });
  const used = consumeGrant(grant, p.digest);
  assert.equal(used.used, 1);
  assert.equal(used.state, 'DISPATCH_RESERVED');
  assert.throws(() => consumeGrant(used, p.digest), /expired|revoked|already used/i);
  assert.throws(() => approve(p, { source: 'worker', digest: p.digest }), /trusted user/i);
  assert.throws(() => approve(p, { source: 'trusted-user', digest: 'wrong' }), /digest/i);
});

test('budget reservation conserves resources and rejects oversubscription', () => {
  const policy = normalizePolicy({ budgets: { run: { maxModelCalls: 1, maxInputTokens: 10, maxOutputTokens: 5 }, escalation: { maxConcurrentWorkers: 1 } } });
  const budget = emptyBudget(policy);
  const p = { digest: 'p1', maxCalls: 1, maxInputTokens: 10, maxOutputTokens: 5, maxCostMicro: 0 };
  const first = reserve(budget, p, 'reservation-1');
  assert.equal(first.budget.reserved.calls, 1);
  assert.throws(() => reserve(first.budget, { ...p, digest: 'p2' }, 'reservation-2'), /exhausted|slot/i);
  const settled = settleReservation(first.budget, 'reservation-1', { calls: 1, inputTokens: 8, outputTokens: 3 });
  assert.deepEqual(settled.budget.settled, { calls: 1, inputTokens: 8, outputTokens: 3, costMicro: 0 });
  assert.equal(settled.budget.reserved.calls, 0);
});
