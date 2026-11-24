import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FarEngine } from '../src/engine.mjs';
import { relative, snapshot, redact, execFileAsync } from '../src/io.mjs';
import { fixture, passCheck, reviewAll, ready } from './helpers.mjs';

test('initialization is durable and idempotent; .far is excluded', async t => {
  const { engine, dir } = await fixture(t); const a = await engine.start(), b = await engine.start();
  assert.equal(a.runId, b.runId); assert.equal(a.coverage.total, 1); assert.equal((await snapshot(dir)).files.length, 1);
  assert.equal((await (await FarEngine.open(dir)).status()).runId, a.runId);
});
test('mode switch preserves findings and requires a reason', async t => {
  const { engine } = await fixture(t); await engine.start({ mode: 'audit' });
  await assert.rejects(engine.start({ mode: 'full' }), /existing audit/);
  await assert.rejects(engine.changeMode('full', ''), /reason/);
  await engine.changeMode('full', 'Explicitly proceed with implementation'); assert.equal((await engine.status()).mode, 'full');
});
test('enumeration cannot satisfy review coverage', async t => { const { engine } = await fixture(t); await engine.start(); const g = await engine.gates(); assert.equal(g.criteria.find(x => x.id === 'review-coverage').status, 'FAIL'); });
test('source content edit invalidates recorded review', async t => {
  const { engine, dir } = await fixture(t); await engine.start(); await reviewAll(engine);
  await fs.writeFile(path.join(dir, 'src/main.js'), 'export const answer = 43;');
  assert.equal((await engine.gates()).criteria.find(x => x.id === 'review-coverage').status, 'FAIL');
});
test('new nonignored files are included; ignored cache is not', async t => {
  const { engine, dir } = await fixture(t); await engine.start(); await fs.writeFile(path.join(dir, 'new.js'), '// new');
  await fs.writeFile(path.join(dir, '.gitignore'), 'cache/\n'); await fs.mkdir(path.join(dir, 'cache')); await fs.writeFile(path.join(dir, 'cache/data'), 'ignored');
  const x = await engine.inventory(); assert(x.files.some(f => f.path === 'new.js')); assert(!x.files.some(f => f.path.startsWith('cache/')));
});
test('deleted tracked files remain explicit in scope', async t => { const { engine, dir } = await fixture(t); await engine.start(); await fs.unlink(path.join(dir, 'src/main.js')); assert.equal((await engine.inventory()).files[0].kind, 'deleted'); });
test('coverage cannot record paths absent from inventory', async t => { const { engine } = await fixture(t); await engine.start(); await assert.rejects(engine.recordCoverage({ paths: ['missing.js'], reviewer: 'a', evidence: 'b', summary: 'c' }), /outside/); });
test('unsafe relative paths rejected', () => { for (const p of ['../escape', '/tmp/a', 'a/../../b', 'a\\b', 'C:/file', 'a//b', 'a/./b']) assert.throws(() => relative(p)); assert.equal(relative('src/main.js'), 'src/main.js'); });
test('symlinked state directory is refused', async t => {
  const { dir } = await fixture(t); await fs.mkdir(path.join(dir, 'elsewhere')); await fs.symlink('elsewhere', path.join(dir, '.far'));
  const engine = await FarEngine.open(dir); await assert.rejects(engine.start(), /symlink/);
});
test('source symlink is inventoried without following its target', async t => { const { dir, engine } = await fixture(t); await fs.symlink('/etc/passwd', path.join(dir, 'link')); await engine.start(); assert.equal((await engine.inventory()).files.find(f => f.path === 'link').kind, 'symlink'); });
test('parallel state writers do not lose findings', async t => {
  const { engine } = await fixture(t); await engine.start();
  await Promise.all(Array.from({ length: 12 }, (_, i) => engine.addFinding({ title: `F${i}`, paths: ['src/main.js'], evidence: 'source:1', impact: 'bounded', remediation: 'fix', severity: 'low' })));
  const s = await engine.state(); assert.equal(s.findings.length, 12); assert.equal(new Set(s.findings.map(f => f.id)).size, 12);
});
test('high-severity findings cannot be deferred', async t => {
  const { engine } = await fixture(t); await engine.start(); const f = await engine.addFinding({ title: 'risk', paths: ['src/main.js'], evidence: 'line 1', impact: 'serious', remediation: 'fix', severity: 'high' });
  await assert.rejects(engine.updateFinding({ id: f.id, status: 'deferred', reason: 'too hard' }), /cannot/);
});
test('a verified fix requires executed evidence, not a claim', async t => {
  const { engine } = await fixture(t); await engine.start(); const f = await engine.addFinding({ title: 'risk', paths: ['src/main.js'], evidence: 'line 1', impact: 'bounded', remediation: 'fix', severity: 'low' });
  await assert.rejects(engine.updateFinding({ id: f.id, status: 'verified', implementer: 'main', reason: 'looks good', evidenceIds: ['made-up'] }), /fresh passing/);
});
test('same reviewer and implementer rejected', async t => { const { engine } = await fixture(t); await engine.start(); await assert.rejects(engine.addReview({ reviewer: 'same', implementer: 'same', verdict: 'approve', evidence: 'test', summary: 'test' }), /separate/); });
test('finish fails on empty required verification contract', async t => { const { engine } = await fixture(t); await engine.start(); await reviewAll(engine); await assert.rejects(engine.finish(), /Cannot finish/); });
test('audit mode completes without claiming release readiness', async t => { const { engine } = await fixture(t); await engine.start({ mode: 'audit' }); await reviewAll(engine); const out = await engine.finish(); assert.equal(out.readiness, 'NOT_ASSESSED'); });
test('plan mode completes with a sealed plan, without running product tests', async t => {
  const { engine } = await fixture(t); await engine.start({ mode: 'plan' }); await reviewAll(engine); await engine.addCheck(passCheck()); await engine.sealContract('Plan: this will be executed during remediation');
  assert.equal((await engine.finish()).readiness, 'NOT_ASSESSED');
});
test('full workflow produces READY only after all stages and review', async t => { const { engine } = await fixture(t); await ready(engine); assert.equal((await engine.finish()).readiness, 'READY'); assert.equal((await engine.status()).status, 'complete'); });
test('full completion fails after source changes', async t => { const { engine, dir } = await fixture(t); await ready(engine); await fs.writeFile(path.join(dir, 'src/main.js'), '// change'); await assert.rejects(engine.finish(), /Cannot finish/); });
test('missing mandatory result is not conditionally ready', async t => { const { engine } = await fixture(t); await engine.start(); await engine.addCheck(passCheck()); await engine.sealContract('Required'); assert.equal((await engine.gates()).readiness, 'NOT_READY'); });
test('sealed check changes require an explicit rationale and reseal', async t => {
  const { engine } = await fixture(t); await engine.start(); await engine.addCheck(passCheck()); await engine.sealContract('Required');
  await assert.rejects(engine.addCheck(passCheck()), /reason/); await engine.addCheck(passCheck(), 'Toolchain command corrected from project evidence'); assert.equal((await engine.state()).contract.sealed, false);
});
test('prepare branch never stashes or overwrites dirty files', async t => {
  const { engine, dir } = await fixture(t); await engine.start(); await fs.writeFile(path.join(dir, 'src/main.js'), '// user work');
  await assert.rejects(engine.prepareBranch(), /preexisting/); assert.equal(await fs.readFile(path.join(dir, 'src/main.js'), 'utf8'), '// user work');
});
test('prepare branch creates a clean dedicated branch without commits', async t => { const { engine } = await fixture(t); await engine.start(); const r = await engine.prepareBranch(); assert(r.branch.startsWith('chore/far-hardening-')); });
test('report is derived and does not affect source fingerprint', async t => { const { engine, dir } = await fixture(t); await engine.start(); const before = (await snapshot(dir)).digest; const r = await engine.report(); assert.equal(r.files.length, 7); assert.equal((await snapshot(dir)).digest, before); });
test('pause prevents new mutating work; resume restores continuation', async t => { const { engine } = await fixture(t); await engine.start(); await engine.control('pause'); await assert.rejects(engine.inventory(), /paused/); await engine.control('resume'); await engine.inventory(); });
test('redactor masks common secrets without claiming exhaustive removal', () => { const r = redact('password=hunter2 Bearer abcdefgh secret=thing sk-abcdefgh1234567890123456'); assert(!r.includes('hunter2')); assert(!r.includes('abcdefgh1234567890123456')); });
test('subdirectory input resolves to the repository root', async t => { const { dir } = await fixture(t); assert.equal((await FarEngine.open(path.join(dir, 'src'))).root, dir); });
test('repository status remains uncommitted after initialization', async t => { const { engine, dir } = await fixture(t); const before = (await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout; await engine.start(); assert.equal((await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout, before); });
test('audit cannot finish while a claimed worker is outstanding', async t => { const { engine } = await fixture(t); await engine.start({ mode: 'audit' }); await reviewAll(engine); await engine.seedAudits(); await engine.wave({ claim: true }); await assert.rejects(engine.finish(), /active-workers|audit-tasks/); });
test('tampered evidence log blocks release readiness', async t => { const { engine, dir } = await fixture(t); await ready(engine); const r = (await engine.state()).runs[0]; await fs.writeFile(path.join(dir, r.log), 'forged output'); assert.equal((await engine.gates()).criteria.find(c => c.id === 'mandatory-checks').status, 'FAIL'); await assert.rejects(engine.finish(), /mandatory-checks/); });
test('missing evidence log blocks release readiness', async t => { const { engine, dir } = await fixture(t); await ready(engine); const r = (await engine.state()).runs[0]; await fs.unlink(path.join(dir, r.log)); await assert.rejects(engine.finish(), /mandatory-checks/); });
test('existing unrelated .far data is not overwritten', async t => { const { engine, dir } = await fixture(t); await fs.mkdir(path.join(dir, '.far')); await fs.writeFile(path.join(dir, '.far/README.md'), 'user data'); await assert.rejects(engine.start(), /nonempty/); assert.equal(await fs.readFile(path.join(dir, '.far/README.md'), 'utf8'), 'user data'); });
test('executable-bit change invalidates the source review', async t => { const { engine, dir } = await fixture(t); await engine.start(); await reviewAll(engine); await fs.chmod(path.join(dir, 'src/main.js'), 0o755); assert.equal((await engine.gates()).criteria.find(c => c.id === 'review-coverage').status, 'FAIL'); });
test('baseline excludes plugin-owned state noise', async t => { const { engine } = await fixture(t); await engine.start(); assert.equal((await engine.state()).baseline.porcelain, ''); });
test('frozen stages admit only release-relevant task work', async t => {
  const { engine } = await fixture(t);
  await engine.start();
  await reviewAll(engine);
  await engine.addCheck(passCheck());
  await engine.sealContract('Release qualification contract.');
  await engine.runChecks();
  await engine.advance();
  const input = { title: 'late task', instructions: 'bounded qualification', kind: 'audit', readPaths: ['src/main.js'] };
  await assert.rejects(engine.addTasks([input]), /frozen candidate/);
  await engine.addTasks([{ ...input, admission: 'qualification' }]);
});
