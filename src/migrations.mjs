/** Versioned FAR state migration and restore helpers. */
import { createHash } from 'node:crypto';
import { POLICY_SCHEMA_VERSION, createPolicy } from './policy.mjs';

export const STATE_SCHEMA_VERSION = 2;
export const CONFIG_SCHEMA_VERSION = 1;

const clone = value => structuredClone(value);
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export function validateMigratableState(input) {
  if (!input || typeof input !== 'object') throw new Error('FAR state must be an object');
  if (![1, STATE_SCHEMA_VERSION].includes(input.schemaVersion)) throw new Error(`Unsupported FAR state schema ${input.schemaVersion}`);
  for (const name of ['tasks', 'findings', 'runs', 'reviews']) if (!Array.isArray(input[name])) throw new Error(`Invalid FAR state field ${name}`);
  if (!input.runId || !input.mode || !input.root) throw new Error('FAR state is missing repository identity');
  return true;
}

export function migrateState(input, { targetRoot = input?.root } = {}) {
  validateMigratableState(input);
  if (input.schemaVersion === STATE_SCHEMA_VERSION) return { state: clone(input), changed: false, mapped: [], defaulted: [], unknown: [] };
  const state = clone(input);
  const defaulted = [];
  const set = (name, value) => { if (state[name] === undefined) { state[name] = value; defaulted.push(name); } };
  set('repositoryId', state.baseline?.head ? `git:${state.baseline.head}` : `path:${targetRoot}`);
  set('relocationHistory', []);
  set('outcome', state.status === 'complete' ? 'COMPLETE' : null);
  set('lifecycle', state.status === 'complete' ? 'closed' : state.status);
  set('pauseReason', null);
  set('readiness', state.finalAssessment?.readiness ?? 'NOT_ASSESSED');
  set('recommendedAction', null);
  set('policy', createPolicy({ source: 'migration-default', mode: 'shelve', revision: 1 }));
  set('proposals', []);
  set('approvals', []);
  set('budgets', state.policy.budgets);
  set('operations', {});
  set('waves', []);
  set('checkpoints', []);
  set('planActions', []);
  set('convergence', { maxWaves: 8, noProgressLimit: 3, completedWaves: 0, noProgress: 0, history: [] });
  set('scope', { paths: ['.'], base: null, profile: 'balanced', explicit: false });
  set('release', { candidate: null, artifacts: [], publication: 'NOT_PUBLISHED' });
  state.tasks = state.tasks.map(task => ({ ...task, dependencyConditions: task.dependencyConditions ?? {}, status: task.status === 'deferred' ? 'deferred' : task.status }));
  state.findings = state.findings.map(finding => ({ ...finding, fingerprint: finding.fingerprint ?? sha({ title: finding.title, category: finding.category, paths: finding.paths, evidence: finding.evidence }), aliases: finding.aliases ?? [], obligations: finding.obligations ?? [] }));
  state.reviews = state.reviews.map(review => ({ ...review, subject: review.subject ?? `${review.scope}:${review.snapshot}:${(review.findingIds ?? []).join(',')}`, supersedes: review.supersedes ?? [], resolves: review.resolves ?? [] }));
  state.runs = state.runs.map(run => ({ ...run, contextHash: run.contextHash ?? run.snapshot ?? null, inputManifest: run.inputManifest ?? { source: run.snapshot ?? null, conservative: true }, authoritative: run.authoritative !== false }));
  state.schemaVersion = STATE_SCHEMA_VERSION;
  state.configSchemaVersion = CONFIG_SCHEMA_VERSION;
  state.policySchemaVersion = POLICY_SCHEMA_VERSION;
  state.root = targetRoot;
  state.updatedAt = new Date().toISOString();
  return { state, changed: true, mapped: ['schemaVersion:1->2', 'legacy status/lifecycle', 'legacy model routing'], defaulted, unknown: ['historical usage and approvals remain unknown'] };
}

export function migrationDryRun(input, options = {}) {
  const before = JSON.stringify(input);
  const result = migrateState(input, options);
  return { ...result, sourceHash: sha(before), resultHash: sha(result.state), writes: false };
}

export function restoreSnapshot(snapshot, { targetRoot } = {}) {
  validateMigratableState(snapshot);
  if (!targetRoot) throw new Error('Restore requires an explicit target root');
  const restored = clone(snapshot);
  restored.root = targetRoot;
  restored.relocationHistory = [...(restored.relocationHistory ?? []), { from: snapshot.root, to: targetRoot, at: new Date().toISOString(), explicit: true }];
  return restored;
}
