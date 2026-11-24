import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, passCheck, reviewAll, ready } from './helpers.mjs';

test('AC-GATE-01: later final rejection supersedes approval', async t => {
  const { engine } = await fixture(t);
  await ready(engine);
  await engine.addReview({ scope: 'final', reviewer: 'reviewer-2', implementer: 'coordinator', verdict: 'changes_required', evidence: 'follow-up review', summary: 'Found an unresolved release issue.' });
  const gate = await engine.gates();
  assert.equal(gate.criteria.find(c => c.id === 'independent-final-review').status, 'FAIL');
  assert.equal(gate.readiness, 'NOT_READY');
});

test('AC-GATE-03: latest applicable failure rejects historical finding evidence', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await reviewAll(engine);
  const finding = await engine.addFinding({ title: 'Defect', severity: 'medium', paths: ['src/main.js'], evidence: 'reproduction', impact: 'wrong result', remediation: 'fix it' });
  await engine.addCheck(passCheck('baseline'));
  await engine.addCheck({ id: 'defect', argv: [process.execPath, '-e', 'process.exit(process.env.FAR_REGRESSION_FAIL ? 7 : 0)'], category: 'tests', required: false });
  const first = (await engine.runChecks(['defect'])).results[0];
  assert.equal(first.status, 'PASS');
  process.env.FAR_REGRESSION_FAIL = '1';
  t.after(() => delete process.env.FAR_REGRESSION_FAIL);
  const second = (await engine.runChecks(['defect'])).results[0];
  assert.equal(second.status, 'FAIL');
  await assert.rejects(engine.updateFinding({ id: finding.id, status: 'verified', reason: 'Historical pass', implementer: 'coordinator', evidenceIds: [first.id] }), /fresh passing|latest/i);
});

test('AC-GATE-05: plan cannot finish with an uncovered actionable finding', async t => {
  const { engine } = await fixture(t);
  await engine.start({ mode: 'plan' });
  await reviewAll(engine);
  await engine.addFinding({ title: 'Known blocker', severity: 'medium', paths: ['src/main.js'], evidence: 'reproduction', impact: 'wrong result', remediation: 'fix it' });
  await engine.addCheck(passCheck());
  await engine.sealContract('Plan contract.');
  await assert.rejects(engine.finish(), /plan-action-coverage|action coverage/i);
});

// Keep the clean-plan contract explicit: no task is invented when no finding exists.
test('AC-GATE-06: clean plan may finish with zero remediation tasks', async t => {
  const { engine } = await fixture(t);
  await engine.start({ mode: 'plan' });
  await reviewAll(engine);
  await engine.addCheck(passCheck());
  await engine.sealContract('Clean plan has no actionable findings.');
  const result = await engine.finish();
  assert.equal(result.readiness, 'NOT_ASSESSED');
});
