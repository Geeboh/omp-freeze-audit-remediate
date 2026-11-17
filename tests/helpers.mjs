import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileAsync } from '../src/io.mjs';
import { FarEngine } from '../src/engine.mjs';
export async function fixture(t, files = { 'src/main.js': 'export const answer = 42;\n' }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-far-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', dir]);
  await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'FAR Test']);
  await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'far-test@example.invalid']);
  for (const [name, content] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true }); await fs.writeFile(path.join(dir, name), content); }
  await execFileAsync('git', ['-C', dir, 'add', '.']);
  await execFileAsync('git', ['-C', dir, 'commit', '-qm', 'fixture']);
  return { dir, engine: await FarEngine.open(dir) };
}
export const passCheck = (id = 'tests', overrides = {}) => ({ id, argv: [process.execPath, '-e', 'console.log("fixture check passed")'], category: 'tests', ...overrides });
export async function reviewAll(engine) {
  const inv = await engine.inventory();
  return engine.recordCoverage({ paths: inv.files.map(f => f.path), reviewer: 'auditor-1', evidence: 'fixture source inspection', summary: 'Read source and verified fixture contracts.' });
}
export async function ready(engine) {
  await engine.start(); await reviewAll(engine); await engine.addCheck(passCheck()); await engine.sealContract('Fixture test is the required automated validation command.');
  await engine.runChecks(); await engine.advance(); await engine.advance();
  await engine.addReview({ scope: 'final', reviewer: 'reviewer-2', implementer: 'coordinator', verdict: 'approve', evidence: 'fixture independent review transcript', summary: 'Fixture review complete; no claims about a real product.' });
}
class Schema {
  constructor(kind, data = {}) { this.kind = kind; Object.assign(this, data); }
  optional() { return new Schema(this.kind, { ...this, optionalField: true }); }
  describe(description) { this.description = description; return this; }
}
export function mockHost(cwd) {
  const tools = new Map(), commands = new Map(), handlers = new Map(), sent = [], notifications = [];
  const z = { string: () => new Schema('string'), number: () => new Schema('number'), boolean: () => new Schema('boolean'), enum: values => new Schema('enum', { values }), array: item => new Schema('array', { item }), object: fields => new Schema('object', { fields }) };
  const state = { plan: { status: 'inactive' }, vibe: { status: 'inactive' }, goal: { status: 'inactive' }, loop: { status: 'inactive' } };
  const current = { provider: 'fixture', id: 'parent-model' };
  const pi = { zod: z, registerTool: t => tools.set(t.name, t), registerCommand: (name, def) => commands.set(name, def),
    on: (e, h) => { if (!handlers.has(e)) handlers.set(e, []); handlers.get(e).push(h); },
    getAllTools: () => [...tools.values(), { name: 'task', parameters: {} }], getCommands: () => [...commands.keys()].map(name => ({ name })),
    sendMessage: (m, o) => sent.push({ m, o }), sendUserMessage: async (m, o) => sent.push({ prompt: m, options: o }), logger: { warn: () => {} } };
  const ctx = { cwd, mode: 'tui', agent: { kind: 'main', id: 'main', name: 'main', depth: 0 }, model: current, isIdle: () => true,
    models: { current: () => current, list: () => [current], resolve: role => role === '@smol' ? { provider: 'fixture', id: 'small' } : role === '@slow' ? { provider: 'fixture', id: 'deep' } : role === '@default' ? current : undefined },
    ui: { notify: (m, l) => notifications.push({ m, l }), setStatus: () => {} },
    sessionModes: { getState: () => structuredClone(state), set: async request => { if (request.action === 'enter') state.goal = { status: 'active', objective: request.objective }; else if (request.action === 'pause') state.goal.status = 'paused'; else if (request.action === 'resume') state.goal.status = 'active'; return { ok: true, changed: true, state: structuredClone(state) }; } } };
  return { pi, ctx, tools, commands, handlers, sent, notifications, state, emit: async (name, event = {}) => { const out = []; for (const h of handlers.get(name) ?? []) out.push(await h(event, ctx)); return out; } };
}
