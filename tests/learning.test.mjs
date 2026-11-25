import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { invoke } from '../src/actions.mjs';
import { fixture } from './helpers.mjs';

test('learning is disabled by default and cannot block a run', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const result = await engine.learning('observe', { claim: 'password=secret should never be exported', actual: 'disabled' });
  assert.equal(result.recorded, false);
  assert.equal(result.reason, 'disabled');
  assert.equal((await engine.status()).learning.enabled, false);
  const routed = await invoke(engine, 'far', { action: 'learning', learningAction: 'status' });
  assert.equal(routed.enabled, false);
});
test('learning rejects unknown finding references and preserves control actions', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await assert.rejects(engine.learning('group', { findingIds: ['missing'], mechanism: 'unknown' }), /unknown finding/i);
  await assert.rejects(engine.learning('assessment_task', { findingIds: ['missing'] }), /unknown finding/i);
  await invoke(engine, 'far', { action: 'pause', reason: 'test pause' });
  assert.equal((await engine.status()).status, 'paused');
  await invoke(engine, 'far', { action: 'resume', reason: 'test resume' });
  assert.equal((await engine.status()).status, 'active');
});
test('validated local lessons preserve evidence and do not change policy', async t => {
  const { engine, dir } = await fixture(t);
  await engine.start();
  await engine.learning('configure', { enabled: true });
  const observation = await engine.learning('observe', { kind: 'failure', claim: 'Runner inherited harness state', actual: 'Nested test command skipped assertions', hypothesis: 'Child runtime inherited NODE_TEST_CONTEXT', evidenceRefs: ['tests/runner.test.mjs:childEnvironment'], applicability: 'Node child test commands in this repository' });
  assert.equal(observation.recorded, true);
  const lesson = await engine.learning('propose', { claim: 'Remove the parent-only harness marker before nested Node tests', observationIds: [observation.observation.id], supportingEvidenceRefs: ['tests/runner.test.mjs:childEnvironment'] });
  const validated = await engine.learning('validate', { id: lesson.id, validationRefs: ['tests/runner.test.mjs:real successful process records PASS'] });
  assert.equal(validated.status, 'validated');
  const finding = await engine.addFinding({ title: 'Shared runner state', severity: 'low', paths: ['src/runner.mjs'], evidence: 'fixture failure', impact: 'false test success', remediation: 'isolate child environment' });
  const group = await engine.learning('group', { findingIds: [finding.id], mechanism: 'parent-only runtime state crosses process boundary', evidenceRefs: [validated.id], confidence: 0.8 });
  assert.equal(group.findingIds[0], finding.id);
  const task = await engine.learning('assessment_task', { findingIds: [finding.id], title: 'Assess runner state boundary', instructions: 'Compare bounded alternatives and migration risk.' });
  assert.equal(task.kind, 'review');
  const exported = await engine.learning('export');
  const data = JSON.parse(await fs.readFile(path.join(dir, exported.file), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.scope, 'local-only');
  assert(!JSON.stringify(data).includes('password=secret'));
  assert.equal((await engine.status()).options.policy.escalation.mode, 'shelve');
});

test('NOESIS remains an explicit unavailable boundary', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const status = await engine.learning('noesis_status');
  assert.equal(status.status, 'unavailable');
  assert.match(status.reason, /verified NOESIS interface/i);
});
