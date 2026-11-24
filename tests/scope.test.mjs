import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { paginate } from '../src/pagination.mjs';

test('explicit scope limits inventory and reports the scope', async t => {
  const { engine } = await fixture(t, { 'src/main.js': 'export const answer = 42;\n', 'docs/readme.md': '# fixture\n' });
  await engine.start({ scope: { paths: ['src'], explicit: true }, profile: 'quick' });
  const inventory = await engine.inventory();
  assert.deepEqual(inventory.files.map(file => file.path), ['src/main.js']);
  assert.equal((await engine.status()).scope.paths[0], 'src');
});

test('exact finding duplicates preserve one obligation and an alias observation', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  const input = { title: 'same issue', severity: 'medium', paths: ['src/main.js'], evidence: 'same reproduction', impact: 'bounded', remediation: 'fix' };
  const first = await engine.addFinding(input);
  const second = await engine.addFinding(input);
  assert.equal(second.id, first.id);
  assert.equal((await engine.state()).findings.length, 1);
  assert.equal((await engine.state()).findings[0].aliases.length, 1);
});

test('pagination returns stable structured pages and rejects a changed cursor', () => {
  const first = paginate([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { limit: 2, revision: 4 });
  assert.deepEqual(first.items.map(item => item.id), ['a', 'b']);
  assert.equal(first.totalKnown, 3);
  const second = paginate([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { limit: 2, cursor: first.nextCursor, revision: 4 });
  assert.deepEqual(second.items.map(item => item.id), ['c']);
  assert.throws(() => paginate([{ id: 'a' }, { id: 'x' }, { id: 'c' }], { limit: 2, cursor: first.nextCursor }), /stale/);
});
