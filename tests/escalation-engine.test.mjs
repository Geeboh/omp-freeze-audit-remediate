import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

const base = { provider: 'fixture', model: 'base', effort: 'standard', maxCalls: 1, maxInputTokens: 10, maxOutputTokens: 5, maxWorkers: 1 };
const upgrade = { provider: 'fixture', model: 'deep', effort: 'high', maxCalls: 1, maxInputTokens: 10, maxOutputTokens: 5, maxWorkers: 1 };

test('engine defaults new runs to shelve and rejects untrusted policy changes', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  assert.equal((await engine.status()).options.policy.escalation.mode, 'shelve');
  await assert.rejects(engine.setEscalationMode('always'), /trusted user/i);
  await engine.setEscalationMode('ask', { trusted: true });
  assert.equal((await engine.status()).options.policy.escalation.mode, 'ask');
});

test('engine shelves upgrades when host enforcement is unavailable', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const { request, decision } = await engine.proposeEscalation({ taskId: 'T1', taskRevision: 1, baseline: base, requested: upgrade, objective: 'bounded retry', reason: 'distinct failure evidence' });
  assert.equal(decision.state, 'SHELVED');
  assert.equal(request.state, 'SHELVED');
  assert.equal((await engine.state()).escalationRequests[0].digest, request.digest);
});

test('trusted approval binds proposal and reservation is replay-safe', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const { request } = await engine.proposeEscalation({ taskId: 'T1', taskRevision: 1, baseline: base, requested: upgrade, objective: 'bounded retry', reason: 'distinct failure evidence' });
  const grant = await engine.approveEscalation({ requestId: request.digest, digest: request.digest }, { trusted: true });
  const first = await engine.reserveEscalation({ requestId: request.digest, grantId: grant.id, reservationKey: 'dispatch-1' });
  assert.equal(first.reservation.key, 'dispatch-1');
  const replay = await engine.reserveEscalation({ requestId: request.digest, grantId: grant.id, reservationKey: 'dispatch-1' });
  assert.equal(replay.replayed, true);
});
