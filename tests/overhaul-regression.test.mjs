import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, passCheck, reviewAll } from './helpers.mjs';

test('AC-GATE-01 rejects a later final rejection after approval', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await reviewAll(engine);
  await engine.addCheck(passCheck());
  await engine.sealContract('Required fixture check');
  await engine.runChecks();
  await engine.advance();
  await engine.advance();
  await engine.addReview({ scope: 'final', reviewer: 'reviewer', implementer: 'coordinator', verdict: 'approve', evidence: 'approval', summary: 'approved' });
  await engine.addReview({ scope: 'final', reviewer: 'reviewer', implementer: 'coordinator', verdict: 'changes_required', evidence: 'rejection', summary: 'new objection' });
  const result = await engine.gates();
  assert.equal(result.criteria.find(criteria => criteria.id === 'independent-final-review').status, 'FAIL');
  assert.equal(result.readiness, 'NOT_READY');
});

test('AC-GATE-03 rejects historical finding PASS after newer same-context failure', async t => {
  const { engine, dir } = await fixture(t);
  await engine.start();
  await reviewAll(engine);
  const finding = await engine.addFinding({ title: 'Defect', severity: 'low', paths: ['src/main.js'], evidence: 'reproduced', impact: 'wrong result', remediation: 'fix', obligations: ['defect'] });
  await engine.addCheck(passCheck('baseline'));
  await engine.addCheck(passCheck('defect', { argv: [process.execPath, '-e', "process.exit(require('node:fs').existsSync('.far/defect-fail') ? 1 : 0)"], required: false }));
  await engine.sealContract('Baseline and defect checks');
  const first = await engine.runChecks();
  const oldPass = first.results.find(result => result.checkId === 'defect');
  await fs.writeFile(path.join(dir, '.far/defect-fail'), 'fail');
  const second = await engine.runChecks(['defect']);
  assert.equal(second.results[0].status, 'FAIL');
  await assert.rejects(engine.updateFinding({ id: finding.id, status: 'verified', reason: 'historical evidence', implementer: 'coordinator', evidenceIds: [oldPass.id] }), /fresh passing/);
});

test('AC-GATE-05 requires plan action coverage while allowing a clean zero-action plan', async t => {
  const first = await fixture(t);
  await first.engine.start({ mode: 'plan' });
  await reviewAll(first.engine);
  await first.engine.addFinding({ title: 'Unplanned blocker', severity: 'medium', paths: ['src/main.js'], evidence: 'known', impact: 'blocked', remediation: 'plan it' });
  await first.engine.addCheck(passCheck());
  await first.engine.sealContract('Plan check');
  await assert.rejects(first.engine.finish(), /plan-action-coverage/);

  const second = await fixture(t);
  await second.engine.start({ mode: 'plan' });
  await reviewAll(second.engine);
  await second.engine.addCheck(passCheck());
  await second.engine.sealContract('Clean plan check');
  const finished = await second.engine.finish();
  assert.equal(finished.readiness, 'NOT_ASSESSED');
});
