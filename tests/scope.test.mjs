import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

test('explicit scope filters inventory without claiming unrelated paths', async t => {
  const { engine } = await fixture(t, { 'src/main.js': 'export const answer = 42;\n', 'docs/other.md': '# other\n' });
  await engine.start({ scope: { include: ['src'], dependencyMode: 'known-only' } });
  const status = await engine.status();
  assert.equal(status.coverage.total, 1);
  assert.deepEqual((await engine.inventory()).files.map(file => file.path), ['src/main.js']);
});

test('exact finding duplicates preserve one obligation and aliases', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const input = { title: 'Same defect', severity: 'medium', category: 'correctness', paths: ['src/main.js'], evidence: 'same failure', impact: 'same impact', remediation: 'same fix' };
  const first = await engine.addFinding(input);
  const second = await engine.addFinding({ ...input, alias: 'worker-observation-2' });
  assert.equal(second.duplicateOf, first.id);
  assert.equal((await engine.state()).findings.length, 1);
  assert.deepEqual((await engine.state()).findings[0].dedup.aliases, ['worker-observation-2']);
});

test('list operations return stable structured pages', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  for (let i = 0; i < 3; i++) await engine.addFinding({ title: `Finding ${i}`, severity: 'low', paths: ['src/main.js'], evidence: `evidence-${i}`, impact: 'bounded', remediation: 'fix' });
  const first = await engine.listFindings({ limit: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.totalKnown, 3);
  assert.equal(first.snapshotRevision, (await engine.state()).revision - 0);
  const second = await engine.listFindings({ limit: 2, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
});
