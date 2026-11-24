import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { createPolicy, decideEscalation, defaultBudgets, reserveBudget, settleBudget } from '../src/policy.mjs';

test('four escalation policies make distinct deterministic decisions', () => {
  const baseline = { provider: 'fixture', model: 'base', effort: 'low' };
  const proposed = { provider: 'fixture', model: 'deep', effort: 'high' };
  for (const [mode, state, decision] of [['never', 'DENIED', 'DENY'], ['shelve', 'SHELVED', 'SHELVE'], ['ask', 'PENDING_APPROVAL', 'ASK'], ['always', 'APPROVED', 'GRANT']]) {
    const policy = createPolicy({ mode, envelope: baseline, hostCapabilities: { enforcementSupported: true } });
    const proposal = { proposalDigest: `${mode}-digest`, baseline, proposed, requestRevision: 1 };
    const result = decideEscalation({ policy, proposal, hostCapabilities: { enforcementSupported: true } });
    assert.equal(result.state, state);
    assert.equal(result.decision, decision);
  }
});

test('budget reservation is conserved and slots are reusable', () => {
  const initial = defaultBudgets({ maxCalls: 2, maxTokens: 10, maxConcurrentWorkers: 1 });
  const reserved = reserveBudget(initial, { calls: 1, tokens: 4, slots: 1 });
  assert.deepEqual(reserved.calls, { limit: 2, settled: 0, reserved: 1 });
  assert.throws(() => reserveBudget(reserved, { calls: 2 }), /Insufficient calls/);
  const settled = settleBudget(reserved, { calls: 1, tokens: 4, slots: 1 }, { calls: 1, tokens: 3, slots: 1 });
  assert.deepEqual(settled.calls, { limit: 2, settled: 1, reserved: 0 });
  assert.deepEqual(settled.slots, { limit: 1, settled: 0, reserved: 0 });
  assert.doesNotThrow(() => reserveBudget(settled, { calls: 1, slots: 1 }));
});

test('shelved upgrade stays unresolved until trusted one-use grant and fenced result', async t => {
  const { engine } = await fixture(t);
  await engine.start({ escalationPolicy: 'shelve', envelope: { provider: 'fixture', model: 'base', effort: 'low' } });
  const [task] = await engine.addTasks([{ id: 'upgrade', title: 'Upgrade route', instructions: 'bounded', kind: 'fix', writePaths: ['src/main.js'], envelope: { provider: 'fixture', model: 'deep', effort: 'high' } }]);
  const leased = await engine.wave({ claim: true });
  assert.equal(leased.tasks.length, 0);
  const shelf = await engine.shelfList();
  assert.equal(shelf.items.length, 1);
  await assert.rejects(engine.approveEscalation(shelf.items[0].requestId), /trusted user/);
  await engine.approveEscalation(shelf.items[0].requestId, { origin: 'user-command', actor: 'operator' });
  const reservation = await engine.reserveEscalation(shelf.items[0].requestId, { calls: 1, tokens: 1, slots: 1 });
  assert.equal(reservation.proposal.state, 'DISPATCH_RESERVED');
  const wave = await engine.wave({ claim: true });
  assert.equal(wave.tasks[0].id, task.id);
  const result = await engine.settle({ id: task.id, lease: wave.tasks[0].lease, fence: wave.tasks[0].fence, outcome: 'done', summary: 'integrated', resultKey: 'native-result-1' });
  assert.equal(result.status, 'done');
  const replay = await engine.settle({ id: task.id, lease: wave.tasks[0].lease, fence: wave.tasks[0].fence, outcome: 'done', summary: 'integrated', resultKey: 'native-result-1' });
  assert.equal(replay.status, 'done');
});
