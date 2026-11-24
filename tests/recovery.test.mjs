import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

const task = { id: 'A', title: 'reconcile task', instructions: 'Return bounded evidence', kind: 'audit', readPaths: ['src/main.js'] };

test('dispatch reconciliation and fenced idempotent settlement reject stale results', async t => {
  const { engine } = await fixture(t);
  await engine.start({ parallel: 1 });
  await engine.addTasks([task]);
  const leased = (await engine.wave({ claim: true })).tasks[0];
  await engine.reconcileTask({ id: 'A', lease: leased.lease, fencing: leased.fencingGeneration, workerId: 'native-1', summary: 'Worker identity persisted.' });
  const input = { id: 'A', lease: leased.lease, fencing: leased.fencingGeneration, outcome: 'done', summary: 'Integrated result', idempotencyKey: 'result-1' };
  const settled = await engine.settle(input);
  assert.equal(settled.status, 'done');
  assert.equal((await engine.settle(input)).status, 'done');
  await engine.reopenTask('A', 'new bounded evidence');
  const next = (await engine.wave({ claim: true })).tasks[0];
  await assert.rejects(engine.settle({ ...input, lease: next.lease, fencing: leased.fencingGeneration, idempotencyKey: 'result-2' }), /stale|fencing|lease/i);
});

test('pause fences dispatch, resume reopens useful work, and cancel records closed outcome', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await engine.addTasks([task]);
  await engine.control('pause', 'operator pause');
  await assert.rejects(engine.wave({ claim: true }), /paused/i);
  await engine.control('resume', 'operator resume');
  const leased = (await engine.wave({ claim: true })).tasks[0];
  await engine.control('cancel', 'operator cancel');
  const status = await engine.status();
  assert.equal(status.outcome, 'CANCELLED');
  assert.equal(status.lifecycle, 'closed');
  assert.equal((await engine.state()).tasks.find(t => t.id === 'A').cancelRequestedAt !== undefined, true);
  await engine.settle({ id: 'A', lease: leased.lease, fencing: leased.fencingGeneration, outcome: 'cancelled', summary: 'Owned worker reconciled after cancel' });
});

test('no-progress wave limit stops finite and resumable', async t => {
  const { engine } = await fixture(t);
  await engine.start({ policy: { convergence: { maxNoProgressWaves: 1 } } });
  const result = await engine.wave({ claim: true });
  assert.equal(result.tasks.length, 0);
  assert.equal((await engine.status()).outcome, 'NON_CONVERGENT');
});
