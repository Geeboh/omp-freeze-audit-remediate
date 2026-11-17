import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { VERSION, STATE_DIR, now, hash, requireThat, text, relative, repositoryRoot, snapshot, gitState, git, readState, withLock, atomicWrite, mutate, event, repairDeadLock, noSymlinks, fileHash } from './io.mjs';
import { MODES, coverage, evaluate, runIsFresh, reviewIsFresh, contractHash } from './gates.mjs';
import { makeTask, validateGraph, leaseWave, selectWave, settleTask, agentFor, tier } from './scheduler.mjs';
import { checkSpec, checkWaves, executeCheck } from './runner.mjs';
const ACTIVE = ['active', 'paused', 'blocked'];
function options(input = {}, base = {}) {
  const parallel = input.parallel ?? base.parallel ?? Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length));
  const modelMode = input.modelMode ?? base.modelMode ?? 'auto';
  requireThat(Number.isInteger(parallel) && parallel >= 1 && parallel <= 32, 'parallel must be 1..32');
  requireThat(['auto', 'current'].includes(modelMode), 'modelMode must be auto or current');
  return { parallel, modelMode };
}
function assertActive(s) { requireThat(s.status === 'active', `Run is ${s.status}; explicitly resume it before changes`, 'RUN_INACTIVE'); }
function contentInput(paths) { requireThat(Array.isArray(paths) && paths.length > 0, 'paths must be a nonempty array'); return paths.map(x => relative(x)); }
function actor(v) { return text(v, 'actor', 300); }
function counts(s) {
  return { findings: Object.fromEntries(['critical', 'high', 'medium', 'low'].map(x => [x, s.findings.filter(f => f.severity === x && !['verified', 'dismissed', 'deferred'].includes(f.status)).length])),
    tasks: Object.fromEntries(['pending', 'running', 'done', 'blocked', 'deferred'].map(x => [x, s.tasks.filter(t => t.status === x).length])) };
}
export class FarEngine {
  constructor(root) { this.root = root; }
  static async open(cwd) { return new FarEngine(await repositoryRoot(cwd)); }
  async state(required = true) { return readState(this.root, required); }
  async start({ mode = 'full', ...input } = {}) {
    requireThat(MODES.includes(mode), `Unknown mode ${mode}`);
    return withLock(this.root, async () => {
      const existing = await this.state(false);
      if (existing) {
        requireThat(existing.mode === mode, `An existing ${existing.mode} run exists; use changeMode with a reason to preserve its records`, 'RUN_EXISTS');
        requireThat(existing.status !== 'complete', 'This run is complete. Use resume explicitly to reopen and revalidate it.', 'RUN_COMPLETE');
        return this.summary(existing);
      }
      const entries = await fs.readdir(path.join(this.root, STATE_DIR));
      requireThat(entries.every(e => e === 'write.lock'), 'Refusing to initialize over an unrecognized nonempty .far directory; preserve its contents first', 'STATE_COLLISION');
      const initial = await snapshot(this.root), baseline = await gitState(this.root);
      const s = { schemaVersion: 1, version: VERSION, root: this.root, runId: randomUUID(), revision: 1, createdAt: now(), updatedAt: now(),
        mode, status: 'active', stage: 'feature-freeze', options: options(input), baseline: { ...baseline, snapshot: initial.digest, at: now() },
        inventory: initial, coverage: {}, boundaries: {}, findings: [], tasks: [], checks: [], runs: [], reviews: [], modelUsage: [], events: [],
        contract: { sealed: false, revision: 0, note: null }, finalAssessment: null };
      event(s, 'run-started', { mode });
      await atomicWrite(this.root, `${STATE_DIR}/state.json`, s);
      await atomicWrite(this.root, `${STATE_DIR}/README.md`, '# FAR local state\n\nstate.json is authoritative. evidence/ stores bounded, redacted command logs. reports/ is derived. Do not hand-edit PASS results. Do not commit logs containing secrets. Use the plugin tools or CLI. This directory is excluded from FAR source snapshots.\n');
      return this.summary(s);
    });
  }
  summary(s) {
    return { version: VERSION, runId: s.runId, mode: s.mode, status: s.status, stage: s.stage, revision: s.revision, options: s.options,
      coverage: coverage(s), ...counts(s), contract: s.contract, lastAssessment: s.finalAssessment,
      note: 'Coverage/lastAssessment refer to the last recorded snapshot. Use gate or inventory to validate the current working tree.' };
  }
  async status() { const s = await this.state(false); return s ? this.summary(s) : { initialized: false, next: 'Use /far full, or far(action=start, mode=full).' }; }
  async configure(input) { return mutate(this.root, s => { s.options = options(input, s.options); event(s, 'options-changed', s.options); return s.options; }); }
  async control(action, reason = 'explicit operator request') {
    requireThat(['pause', 'resume', 'blocked'].includes(action), 'Unknown control action');
    return mutate(this.root, s => {
      if (action === 'blocked') requireThat(selectWave(s, { isolation: true }).length === 0 && !s.tasks.some(t => t.status === 'running') && !s.checkBatch, 'Executable or running work remains; finish/settle it before declaring the run blocked');
      s.status = action === 'resume' ? 'active' : action === 'pause' ? 'paused' : 'blocked';
      s.finalAssessment = null; event(s, `run-${action}`, { reason: text(reason) }); return this.summary(s);
    });
  }
  async changeMode(mode, reason) {
    requireThat(MODES.includes(mode), 'Invalid mode'); reason = text(reason, 'scope-change reason');
    return mutate(this.root, s => { requireThat(!s.tasks.some(t => t.status === 'running') && !s.checkBatch, 'Settle running work before a mode change');
      const before = s.mode; s.mode = mode; s.status = 'active'; s.stage = 'feature-freeze'; s.finalAssessment = null;
      event(s, 'mode-changed', { before, after: mode, reason }); return this.summary(s); });
  }
  async inventory() {
    const snap = await snapshot(this.root);
    return mutate(this.root, s => {
      assertActive(s); const previous = new Map(s.inventory.files.map(f => [f.path, f.hash]));
      const changed = snap.files.filter(f => previous.get(f.path) !== f.hash).map(f => f.path);
      const removed = s.inventory.files.filter(f => !snap.files.some(x => x.path === f.path)).map(f => f.path);
      s.inventory = snap; if (changed.length || removed.length) s.finalAssessment = null;
      event(s, 'inventory', { digest: snap.digest, changed, removed });
      return { ...snap, coverage: coverage(s), changed, removed, checkSuggestions: this.suggestChecks(snap) };
    });
  }
  suggestChecks(snap) {
    const names = new Set(snap.files.map(f => f.path));
    const suggestions = [];
    if (names.has('package.json')) suggestions.push('Read package.json scripts and packageManager; register existing test/build/lint commands with the detected manager. Do not assume npm.');
    if (names.has('pyproject.toml') || names.has('pytest.ini')) suggestions.push('Inspect Python project/test config. Use an existing virtual environment or create a local one; do not install into system Python.');
    if (names.has('Cargo.toml')) suggestions.push('Inspect Rust workspace. Candidate checks: cargo test --locked; cargo clippy --locked, where available.');
    if (names.has('go.mod')) suggestions.push('Inspect Go tooling. Candidate checks: go test ./...; go vet ./...; confirm required build tags.');
    return suggestions;
  }
  async recordCoverage({ paths, reviewer, evidence, summary }) {
    paths = contentInput(paths); reviewer = actor(reviewer); evidence = text(evidence, 'review evidence'); summary = text(summary, 'review summary');
    const snap = await snapshot(this.root);
    return mutate(this.root, s => {
      assertActive(s); requireThat(s.inventory?.digest === snap.digest, 'Source changed since inventory; rescan before recording source reviews', 'STALE_INVENTORY');
      const by = new Map(snap.files.map(f => [f.path, f]));
      for (const p of paths) requireThat(by.has(p), `Path is outside the current inventory: ${p}`);
      for (const p of paths) { const f = by.get(p); s.coverage[p] = { hash: f.hash, kind: f.kind, executable: f.executable, reviewer, evidence, summary, at: now(), provenance: 'agent-review-attestation' }; }
      event(s, 'coverage-recorded', { paths, reviewer }); return coverage(s);
    });
  }
  async boundary({ path: name, rationale, evidence }) {
    relative(name); rationale = text(rationale); evidence = text(evidence);
    return mutate(this.root, s => { assertActive(s); requireThat(s.inventory.files.some(f => f.path === name && ['external-tree', 'special'].includes(f.kind)), 'Not an external/special boundary');
      s.boundaries[name] = { hash: s.inventory.files.find(f => f.path === name).hash, rationale, evidence, at: now(), scope: 'integration-only; external internals not audited by this run' };
      event(s, 'boundary-declared', { path: name }); return s.boundaries[name]; });
  }
  async addFinding(input) {
    return mutate(this.root, s => {
      assertActive(s);
      const severity = input.severity ?? 'medium', classification = input.classification ?? 'confirmed';
      requireThat(['critical', 'high', 'medium', 'low'].includes(severity), 'Invalid finding severity');
      requireThat(['confirmed', 'suspected', 'debt', 'test-gap', 'documentation', 'opportunity'].includes(classification), 'Invalid finding classification');
      const f = { id: `F${String(s.findings.length + 1).padStart(4, '0')}`, title: text(input.title, 'finding title', 500), severity, classification,
        category: text(input.category ?? 'correctness', 'category', 200), paths: contentInput(input.paths), evidence: text(input.evidence, 'finding evidence'),
        impact: text(input.impact, 'impact'), remediation: text(input.remediation, 'remediation'),
        releaseBlocking: input.releaseBlocking === true || severity === 'critical' || severity === 'high', status: 'open', at: now(), history: [] };
      s.findings.push(f); event(s, 'finding-added', { id: f.id }); return f;
    });
  }
  async updateFinding({ id, status, reason, evidenceIds = [], reviewId, implementer, commits = [] }) {
    requireThat(['open', 'in_progress', 'fixed', 'verified', 'blocked', 'deferred', 'dismissed'].includes(status), 'Invalid finding status');
    reason = text(reason, 'disposition reason');
    const snap = await snapshot(this.root);
    return mutate(this.root, async s => {
      assertActive(s); const checked = await this.validatedEvidence(s); const f = s.findings.find(x => x.id === id); requireThat(f, 'Unknown finding');
      if (status === 'deferred') requireThat(!f.releaseBlocking && !['critical', 'high'].includes(f.severity), 'Release blockers cannot be silently deferred');
      if (implementer) f.implementer = actor(implementer);
      if (status === 'verified') {
        requireThat(f.implementer, 'Record the implementer before verification');
        requireThat(evidenceIds.length > 0 && evidenceIds.every(e => {
          const r = checked.runs.find(x => x.id === e), c = r && s.checks.find(x => x.id === r.checkId); return c && runIsFresh(r, c, snap);
        }), 'Verification requires fresh passing local command evidence', 'STALE_EVIDENCE');
        if (f.releaseBlocking || f.severity === 'high' || f.severity === 'critical') {
          const r = s.reviews.find(x => x.id === reviewId);
          requireThat(reviewIsFresh(r, snap) && r.reviewer !== f.implementer && (r.findingIds.includes(f.id) || r.scope === 'final'), 'Consequential fix requires a current separate-reviewer record');
        }
        f.verifiedSnapshot = snap.digest; f.evidenceIds = evidenceIds; f.reviewId = reviewId ?? null;
      }
      if (status === 'dismissed' && f.releaseBlocking) {
        const r = s.reviews.find(x => x.id === reviewId);
        requireThat(reviewIsFresh(r, snap) && (r.findingIds.includes(f.id) || r.scope === 'final'), 'Dismissing a release blocker requires a current independent review with evidence');
        f.dispositionSnapshot = snap.digest; f.reviewId = reviewId;
      }
      f.history.push({ at: now(), before: f.status, after: status, reason }); f.status = status; f.reason = reason; f.commits = commits.map(c => text(c, 'commit ref', 100));
      event(s, 'finding-updated', { id, status }); return f;
    });
  }
  async addTasks(inputs) {
    requireThat(Array.isArray(inputs) && inputs.length > 0, 'Need at least one task');
    return mutate(this.root, s => { assertActive(s); const created = inputs.map((i, n) => makeTask(i, s.tasks.length + n));
      validateGraph([...s.tasks, ...created]); s.tasks.push(...created); event(s, 'tasks-added', { ids: created.map(t => t.id) }); return created; });
  }
  async seedAudits() {
    return mutate(this.root, s => {
      assertActive(s); requireThat(!s.tasks.some(t => t.seeded), 'Audit tasks have already been seeded; add focused delta tasks instead');
      const groups = new Map();
      for (const f of s.inventory.files) {
        const parts = f.path.split('/'); const key = parts.length === 1 ? '_root' : ['src', 'packages', 'apps', 'modules'].includes(parts[0]) && parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f.path);
      }
      const created = [];
      for (const [component, paths] of groups) {
        // Bounded review batches prevent one giant directory monopolizing a worker.
        for (let i = 0; i < paths.length; i += 60) {
          const batch = paths.slice(i, i + 60), t = makeTask({ title: `Audit ${component} (${i + 1}-${i + batch.length})`, kind: 'audit', readPaths: batch, priority: 50,
            instructions: 'Read every assigned file and its necessary contracts. Audit correctness, security, resource/concurrency handling, DRY/KISS, tests and docs. Return per-file review evidence and confirmed/suspected findings separately. No source edits. Enumeration alone is not review. Report unreviewed/binary/external areas honestly.' }, s.tasks.length + created.length);
          t.seeded = true; created.push(t);
        }
      }
      s.tasks.push(...created); event(s, 'audits-seeded', { count: created.length }); return created;
    });
  }
  async wave({ claim = false, isolation = false, limit } = {}) {
    if (!claim) { const s = await this.state(); return selectWave(s, { isolation, limit }).map(t => ({ ...t, assignedAgent: agentFor(t), tier: tier(t) })); }
    return mutate(this.root, s => { assertActive(s); const tasks = leaseWave(s, { isolation, limit });
      event(s, 'wave-leased', { ids: tasks.map(t => t.id), isolation }); return { tasks, instruction: 'These are reservations, NOT spawned agents. Dispatch with OMP native task using its current schema; settle each lease after inspecting results. Use isolated:true for editing tickets when offered. Integrate patches serially and revalidate the combined tree.' }; });
  }
  async settle(input) { return mutate(this.root, s => { const t = settleTask(s, input); event(s, 'task-settled', { id: t.id, status: t.status }); return t; }); }
  async reopenTask(id, reason) {
    reason = text(reason, 'new evidence or retry reason');
    return mutate(this.root, s => { const t = s.tasks.find(x => x.id === id); requireThat(t && t.status !== 'running', 'Task missing or still running; settle its lease first');
      t.status = 'pending'; t.history.push({ at: now(), outcome: 'reopened', reason }); event(s, 'task-reopened', { id, reason }); return t; });
  }
  async addCheck(input, reason) {
    const spec = checkSpec(input);
    return mutate(this.root, s => {
      assertActive(s); requireThat(!s.checkBatch, 'Cannot alter checks while a batch is running');
      if (s.contract.sealed) requireThat(reason && text(reason), 'Changing sealed checks requires an explicit contract-change reason');
      const i = s.checks.findIndex(c => c.id === spec.id); if (i >= 0) s.checks[i] = spec; else s.checks.push(spec);
      s.contract.sealed = false; s.contract.revision += 1; s.stage = 'feature-freeze'; s.finalAssessment = null;
      event(s, 'check-configured', { id: spec.id, reason: reason ?? 'initial discovery' }); return spec;
    });
  }
  async sealContract(reason) {
    reason = text(reason, 'contract rationale');
    return mutate(this.root, s => { assertActive(s); requireThat(s.checks.some(c => c.required && ['tests', 'validation'].includes(c.category)), 'Define at least one required automated test/validation command before sealing');
      s.contract = { sealed: true, hash: contractHash(s), revision: s.contract.revision + 1, note: reason, at: now() };
      event(s, 'contract-sealed', { hash: s.contract.hash, reason }); return s.contract; });
  }
  async runChecks(ids, signal) {
    const batchId = randomUUID();
    const { checks, parallel } = await mutate(this.root, s => {
      assertActive(s); requireThat(!s.checkBatch, 'Another check batch owns the test environment', 'CHECKS_BUSY');
      requireThat(!s.tasks.some(t => t.status === 'running' && t.writePaths.length && !t.isolated), 'Settle shared-worktree writers before running checks', 'WORKSPACE_BUSY');
      const chosen = ids?.length ? ids.map(id => { const c = s.checks.find(x => x.id === id); requireThat(c, `Unknown check ${id}`); return c; }) : s.checks;
      requireThat(chosen.length > 0 && new Set(chosen.map(c => c.id)).size === chosen.length, 'No checks or duplicate check IDs');
      s.checkBatch = { id: batchId, pid: process.pid, host: os.hostname(), at: now(), ids: chosen.map(x => x.id) };
      return { checks: chosen, parallel: s.options.parallel };
    });
    const results = [];
    try {
      for (const group of checkWaves(checks, parallel)) {
        if (signal?.aborted) break;
        const rs = await Promise.all(group.map(async c => {
          try { return await executeCheck(this.root, c, signal); }
          catch (e) { return { id: `E-${randomUUID()}`, checkId: c.id, specHash: c.specHash, status: 'ERROR', error: e.message, at: now(), provenance: 'runner-error' }; }
        }));
        results.push(...rs);
        await mutate(this.root, s => { requireThat(s.checkBatch?.id === batchId, 'Check batch ownership changed'); s.runs.push(...rs); event(s, 'checks-executed', { ids: rs.map(r => r.id) }); });
      }
    } finally {
      await mutate(this.root, s => { if (s.checkBatch?.id === batchId) delete s.checkBatch; });
    }
    return { results, cancelled: !!signal?.aborted, scheduled: checks.length, executed: results.length };
  }
  async recoverChecks() {
    return mutate(this.root, s => {
      const b = s.checkBatch; requireThat(b, 'No abandoned check batch');
      requireThat(b.host === os.hostname() && Number.isInteger(b.pid), 'Cannot verify batch ownership');
      let alive = true; try { process.kill(b.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e; }
      requireThat(!alive, 'Check batch owner is still alive; cancel the host operation instead');
      delete s.checkBatch; event(s, 'abandoned-check-batch-recovered', b); return { recovered: b, warning: 'Inspect for orphaned test services before reusing shared ports/databases. No prior check was marked PASS.' };
    });
  }
  async addReview({ scope = 'batch', reviewer, implementer, verdict, evidence, summary, findingIds = [] }) {
    requireThat(['batch', 'final'].includes(scope) && ['approve', 'changes_required'].includes(verdict), 'Invalid review scope/verdict');
    reviewer = actor(reviewer); implementer = actor(implementer); requireThat(reviewer !== implementer, 'Reviewer must be a separate actor/context');
    evidence = text(evidence, 'review transcript/artifact reference'); summary = text(summary, 'review summary');
    const snap = await snapshot(this.root);
    return mutate(this.root, s => { assertActive(s); requireThat(findingIds.every(id => s.findings.some(f => f.id === id)), 'Unknown reviewed finding');
      const review = { id: `R${String(s.reviews.length + 1).padStart(4, '0')}`, scope, reviewer, implementer, verdict, evidence, summary, findingIds, snapshot: snap.digest, at: now(), provenance: 'agent-review-attestation' };
      s.reviews.push(review); event(s, 'review-recorded', { id: review.id, verdict }); return review; });
  }
  async validatedEvidence(s) {
    const checked = structuredClone(s);
    for (const r of checked.runs) {
      if (r.status !== 'PASS') continue;
      try {
        requireThat(typeof r.id === 'string' && /^E-[a-f0-9-]+$/.test(r.id) && r.log === `.far/evidence/${r.id}.log`, 'Unexpected evidence path');
        await noSymlinks(this.root, r.log, false);
        requireThat(await fileHash(path.join(this.root, r.log)) === r.logHash, 'Evidence log content changed');
        r.integrity = true; r.integrityReason = 'log hash verified';
      } catch (e) { r.integrity = false; r.integrityReason = e.message; }
    }
    return checked;
  }
  async gates(final = true) { const s = await this.validatedEvidence(await this.state()); return evaluate(s, await snapshot(this.root), { final }); }
  async advance() {
    const snap = await snapshot(this.root);
    return mutate(this.root, async s => {
      assertActive(s); requireThat(!['audit', 'plan'].includes(s.mode), 'Audit/plan modes do not enter release stages');
      const g = evaluate(await this.validatedEvidence(s), snap, { final: false }); requireThat(g.allPassed, `Stage gate failed: ${g.criteria.filter(c => c.status === 'FAIL').map(c => c.id).join(', ')}`, 'GATE_FAILED');
      requireThat(s.stage !== 'release-candidate', 'Already at release candidate; run final review/finish');
      s.stage = s.stage === 'feature-freeze' ? 'code-freeze' : 'release-candidate'; event(s, 'stage-advanced', { stage: s.stage, snapshot: snap.digest }); return this.summary(s);
    });
  }
  async finish() {
    const snap = await snapshot(this.root);
    return mutate(this.root, async s => {
      assertActive(s); const g = evaluate(await this.validatedEvidence(s), snap);
      requireThat(g.allPassed, `Cannot finish: ${g.criteria.filter(c => c.status === 'FAIL').map(c => c.id).join(', ')}`, 'GATE_FAILED');
      s.status = 'complete'; s.finalAssessment = { ...g, at: now() }; event(s, 'run-completed', { readiness: g.readiness, snapshot: snap.digest }); return s.finalAssessment;
    });
  }
  async prepareBranch() {
    const g = await gitState(this.root);
    requireThat(g.head, 'No baseline commit exists; preserve existing files and establish a baseline explicitly');
    // Ignore FAR's own state only. Never stash or commit preexisting user modifications.
    const changes = (await git(this.root, ['status', '--porcelain=v1', '--', '.', ':(exclude).far'])).trim();
    requireThat(!changes, 'Working tree has preexisting changes. No branch switch, stash, commit or discard was performed. Read-only parallel auditing may continue.', 'DIRTY_WORKTREE');
    const branch = `chore/far-hardening-${Date.now()}`;
    await git(this.root, ['switch', '-c', branch]);
    await mutate(this.root, s => { event(s, 'branch-created', { branch, baseline: g.head }); });
    return { branch, baseline: g.head, rollback: 'Review the commits and revert selected remediation commits on the remediation branch. Never reset unrelated user work.' };
  }
  async recordModelUsage(records) {
    return mutate(this.root, s => { const fresh = records.filter(r => !s.modelUsage.some(old => old.observationKey === r.observationKey)); s.modelUsage.push(...fresh); return { recorded: fresh.length }; });
  }
  async report() {
    const s = await this.validatedEvidence(await this.state()), snap = await snapshot(this.root), g = evaluate(s, snap);
    const esc = v => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
    const header = '<!-- Generated by omp-freeze-audit-remediate; state.json is authoritative. -->\n';
    const reports = {
      'README.md': `${header}# Freeze Audit Remediate\n\nMode: **${s.mode}** | Workflow: **${s.status}** | Stage: **${s.stage}**\n\nCurrent readiness: **${g.readiness}**. ${g.qualification}\n\nSource snapshot: \`${snap.digest}\`\n\nReview coverage: ${coverage(s, snap).reviewed}/${snap.files.length}.\n\nNo user testing or user acceptance gate exists.\n\n## Gates\n${g.criteria.map(c => `- ${c.id}: ${c.status}`).join('\n')}\n\n## Reports\n[Findings](DEFECT-REGISTER.md) | [Inventory](INVENTORY.md) | [Checks](VERIFICATION.md) | [Continuation](CONTINUATION.md) | [Model usage](MODEL-USAGE.md)\n`,
      'DEFECT-REGISTER.md': `${header}# Findings\n\n| ID | Severity | Status | Title | Evidence |\n|---|---|---|---|---|\n${s.findings.map(f => `|${f.id}|${f.severity}|${f.status}|${esc(f.title)}|${esc(f.evidence)}|`).join('\n')}\n\nFull root cause, disposition history, tests and commits are in state.json.\n`,
      'INVENTORY.md': `${header}# Inventory\n\n${snap.scope}\n\n| Path | Kind | Current review |\n|---|---|---|\n${snap.files.map(f => `|${esc(f.path)}|${f.kind}|${s.coverage[f.path]?.hash === f.hash && s.coverage[f.path]?.kind === f.kind && s.coverage[f.path]?.executable === f.executable ? 'Recorded' : 'Missing/stale'}|`).join('\n')}\n\nIgnored files and external submodule internals are not silently claimed as reviewed. Boundary decisions: \`${JSON.stringify(s.boundaries)}\`.\n`,
      'VERIFICATION.md': `${header}# Executed verification\n\n| Evidence | Check | Recorded result | Integrity | Snapshot | Log |\n|---|---|---|---|---|---|\n${s.runs.map(r => `|${r.id}|${r.checkId}|${r.status}|${r.integrity === false ? 'INVALID: ' + esc(r.integrityReason) : r.log ? 'verified' : 'no log'}|${r.snapshot?.slice(0, 12) ?? '-'}|${r.log ?? '-'}|`).join('\n')}\n\nA command exit code does not prove adequate test assertions. Review records are agent attestations, not cryptographic proof.\n`,
      'CONTINUATION.md': `${header}# Continuation\n\nRun ${s.runId}; mode ${s.mode}; status ${s.status}; stage ${s.stage}.\n\nResume with /far resume. Start with far status, then refresh inventory. Settle or recover abandoned leases before dispatch. Do not rerun unchanged completed audits.\n\n## Pending/running/blocked tasks\n${s.tasks.filter(t => !['done', 'deferred'].includes(t.status)).map(t => `- ${t.id}: ${t.status} — ${t.title}`).join('\n') || 'None recorded.'}\n\n## Unsatisfied gates\n${g.criteria.filter(c => c.status === 'FAIL').map(c => `- ${c.id}: ${JSON.stringify(c.detail)}`).join('\n') || 'None.'}\n`,
      'MODEL-USAGE.md': `${header}# Observed model execution\n\n${s.modelUsage.length ? '```json\n' + JSON.stringify(s.modelUsage, null, 2) + '\n```' : 'No native task usage metadata has been observed. No model switching, token count or cost saving is claimed.'}\n\nRequested routes are not evidence of executed models. Prices/costs are reported only when the host supplies them.\n`,
    };
    for (const [name, body] of Object.entries(reports)) await atomicWrite(this.root, `.far/reports/${name}`, body);
    await atomicWrite(this.root, '.far/reports/gates.json', g);
    return { directory: path.join(this.root, '.far/reports'), files: [...Object.keys(reports), 'gates.json'], assessment: g };
  }
  async doctor() {
    const s = await this.state(false);
    return { version: VERSION, root: this.root, node: process.version, git: (await git(this.root, ['--version'])).trim(),
      initialized: !!s, lock: await fs.readFile(path.join(this.root, '.far/write.lock'), 'utf8').catch(e => e.code === 'ENOENT' ? null : String(e)),
      pendingCheckBatch: s?.checkBatch ?? null, runningLeases: s?.tasks.filter(t => t.status === 'running').map(t => ({ id: t.id, lease: t.lease, at: t.startedAt })) ?? [],
      liveOmpHostTest: 'not implied by this diagnostic', noUserTesting: true };
  }
  async repairLock() { return repairDeadLock(this.root); }
}
