#!/usr/bin/env node
/** Read-only development package/discovery/link/syntax checks. Artifact integrity is separate. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { definitions } from '../src/schemas.mjs';
import { FAR_AGENTS } from '../src/index.js';
import { VERSION } from '../src/io.mjs';
const run = promisify(execFile), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
function ok(test, message) { if (!test) problems.push(message); }
async function all(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name), rel = path.relative(root, f).split(path.sep).join('/');
    if (['.git', '.far', 'node_modules', '__pycache__'].some(part => rel === part || rel.startsWith(`${part}/`)) || rel === 'docs/overhaul' || rel.startsWith('docs/overhaul/')) continue;
    if (e.isSymbolicLink()) problems.push(`Unexpected package symlink: ${f}`);
    else if (e.isDirectory()) out.push(...await all(f));
    else out.push(f);
  }
  return out;
}
const files = await all(root), pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
ok(pkg.type === 'module', 'Package must be ESM');
ok(pkg.version === VERSION, `Runtime VERSION ${VERSION} differs from package ${pkg.version}`);
ok(Number(pkg.engines?.node?.match(/\d+/)?.[0] ?? 0) >= 22, 'Supported Node floor must be 22 or newer');
ok(pkg.omp?.extensions?.length === 1 && pkg.omp.extensions[0] === './src/index.js', 'Extension manifest mismatch');
for (const rel of pkg.omp.extensions) ok(files.includes(path.resolve(root, rel)), `Missing entry: ${rel}`);
class Shape { constructor(type, data = {}) { this.type = type; Object.assign(this, data); } describe(v) { this.description = v; return this; } optional() { this.optionalField = true; return this; } }
const z = { string: () => new Shape('string'), number: () => new Shape('number'), boolean: () => new Shape('boolean'), enum: values => new Shape('enum', { values }), array: item => new Shape('array', { item }), object: fields => new Shape('object', { fields }) };
const defs = definitions(z);
ok(defs.length === 8 && new Set(defs.map(d => d.name)).size === 8, 'Expected eight distinct tools');
ok(defs[0].name === 'far' && defs[0].loadMode === 'essential', 'Entry tool must be essential');
for (const d of defs) ok(d.description.length > 80 && d.parameters.fields?.action, `Missing tool discovery/schema: ${d.name}`);
const skill = await fs.readFile(path.join(root, 'skills/freeze-audit-remediate/SKILL.md'), 'utf8');
ok(/^---\nname: freeze-audit-remediate\ndescription: .+\n---\n/.test(skill), 'Skill frontmatter invalid');
for (const agent of FAR_AGENTS) {
  const s = await fs.readFile(path.join(root, `agents/${agent}.md`), 'utf8');
  ok(s.startsWith(`---\nname: ${agent}\n`), `Agent name mismatch: ${agent}`);
  for (const field of ['description:', 'tools:', 'model:', 'autoloadSkills:', 'spawns: []', 'prewalk: false']) ok(s.includes(field), `Agent ${agent} missing ${field}`);
  ok(s.includes('freeze-audit-remediate'), `Agent ${agent} missing skill`);
}
for (const file of files.filter(f => f.endsWith('.md'))) {
  const s = await fs.readFile(file, 'utf8');
  for (const m of s.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const link = m[1]; if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
    const dest = path.resolve(path.dirname(file), decodeURIComponent(link.split('#')[0]));
    ok(dest.startsWith(root + path.sep), `Link leaves package: ${file}: ${link}`);
    try { await fs.access(dest); } catch { problems.push(`Broken local link: ${path.relative(root, file)} -> ${link}`); }
  }
}
let syntaxCount = 0;
for (const f of files.filter(f => /\.(mjs|js)$/.test(f))) { try { await run(process.execPath, ['--check', f]); syntaxCount++; } catch (e) { problems.push(`Syntax: ${f}: ${e.stderr}`); } }
const summary = { package: pkg.name, version: pkg.version, files: files.length, tools: defs.length, agents: FAR_AGENTS.length, skills: 1, syntaxChecked: syntaxCount, integrityChecked: 0, liveOmpHost: 'NOT_RUN', artifactIntegrity: 'SEPARATE_CHECK', problems };
console.log(JSON.stringify(summary, null, 2)); if (problems.length) process.exitCode = 1;
