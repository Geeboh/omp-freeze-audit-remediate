import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

const task = (id, extra = {}) => ({ id, title: id, instructions: 'bounded task', kind: 'audit', readPaths: [`src/${id}`], ...extra });

test('shelved dependency does not satisfy ordinary result edge while independent work proceeds', async t => {
  const { engine } = await fixture(t);
  await engine.start({ parallel: 1 });
  await engine.addTasks([task('A', { priority: 1 }), task('B', { priority: 2, dependsOn: ['A'] }), task('C', { priority: 3 })]);
  const first = await engine.wave({ claim: true });
  await engine.settle({ id: 'A', lease: first.tasks[0].lease, fence: first.tasks[0].fence, outcome: 'shelved', summary: 'awaiting approval' });
  const next = await engine.wave();
  assert.deepEqual(next.map(item => item.id), ['C']);
});

test('wave ceiling stops new dispatch and persists the bounded outcome', async t => {
  const { engine } = await fixture(t);
  await engine.start({ maxWaves: 1 });
  await engine.addTasks([task('A')]);
  const first = await engine.wave({ claim: true });
  await engine.settle({ id: 'A', lease: first.tasks[0].lease, fence: first.tasks[0].fence, outcome: 'failed', summary: 'bounded failure' });
  await assert.rejects(engine.wave({ claim: true }), /wave limit exhausted/);
  const state = await engine.state();
  assert.equal(state.convergence.completedWaves, 1);
});

test('pause fences new dispatch but permits late settlement and resume', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await engine.addTasks([task('A')]);
  const claimed = await engine.wave({ claim: true });
  await engine.control('pause');
  await assert.rejects(engine.wave({ claim: true }), /Run is paused/);
  const settled = await engine.settle({ id: 'A', lease: claimed.tasks[0].lease, fence: claimed.tasks[0].fence, outcome: 'done', summary: 'late result', resultKey: 'late-1' });
  assert.equal(settled.status, 'done');
  await engine.control('resume');
  assert.equal((await engine.status()).status, 'active');
});
