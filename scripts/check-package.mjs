#!/usr/bin/env node
/** Static package/discovery/link/syntax checks. Not a live OMP-host test. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { definitions } from '../src/schemas.mjs';
import { FAR_AGENTS } from '../src/index.js';
const run = promisify(execFile), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), artifactMode = process.argv.includes('--artifact');
const problems = [];
function ok(test, message) { if (!test) problems.push(message); }
async function all(dir) { const out = []; for (const e of await fs.readdir(dir, { withFileTypes: true })) { const f = path.join(dir,e.name); if (e.isSymbolicLink()) problems.push(`Unexpected package symlink: ${f}`); else if(e.isDirectory()) out.push(...await all(f)); else out.push(f); } return out; }
const files = await all(root), pkg = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
ok(pkg.type === 'module', 'Package must be ESM');
ok(pkg.omp?.extensions?.length === 1 && pkg.omp.extensions[0] === './src/index.js', 'Extension manifest mismatch');
for(const rel of pkg.omp.extensions) ok(files.includes(path.resolve(root,rel)), `Missing entry: ${rel}`);
class Shape { constructor(type, data={}) { this.type=type; Object.assign(this,data); } describe(v) { this.description=v; return this; } optional() { this.optionalField=true; return this; } }
const z = { string:()=>new Shape('string'), number:()=>new Shape('number'), boolean:()=>new Shape('boolean'), enum:values=>new Shape('enum',{values}), array:item=>new Shape('array',{item}), object:fields=>new Shape('object',{fields}) };
const defs = definitions(z);
ok(defs.length === 8 && new Set(defs.map(d=>d.name)).size === 8, 'Expected eight distinct tools');
ok(defs[0].name === 'far' && defs[0].loadMode === 'essential', 'Entry tool must be essential');
for (const d of defs) ok(d.description.length > 80 && d.parameters.fields?.action, `Missing tool discovery/schema: ${d.name}`);
const skill = await fs.readFile(path.join(root,'skills/freeze-audit-remediate/SKILL.md'),'utf8');
ok(/^---\nname: freeze-audit-remediate\ndescription: .+\n---\n/.test(skill), 'Skill frontmatter invalid');
for(const agent of FAR_AGENTS) {
 const s=await fs.readFile(path.join(root,`agents/${agent}.md`),'utf8');
 ok(s.startsWith(`---\nname: ${agent}\n`), `Agent name mismatch: ${agent}`);
 for(const field of ['description:','tools:','model:','autoloadSkills:','spawns: []','prewalk: false']) ok(s.includes(field), `Agent ${agent} missing ${field}`);
 ok(s.includes('freeze-audit-remediate'), `Agent ${agent} missing skill`);
}
for(const file of files.filter(f=>f.endsWith('.md'))) {
 const s=await fs.readFile(file,'utf8');
 for(const m of s.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
  const link=m[1]; if(/^[a-z][a-z0-9+.-]*:/i.test(link)||link.startsWith('#')) continue;
  const dest=path.resolve(path.dirname(file),decodeURIComponent(link.split('#')[0]));
  ok(dest.startsWith(root+path.sep), `Link leaves package: ${file}: ${link}`);
  try { await fs.access(dest); } catch { problems.push(`Broken local link: ${path.relative(root,file)} -> ${link}`); }
 }
}
const syntaxRuntime=process.versions.bun ? 'node' : process.execPath;
let syntaxCount=0;
for(const f of files.filter(f=>/\.(mjs|js)$/.test(f))) { try { await run(syntaxRuntime,['--check',f]); syntaxCount++; } catch(e) { problems.push(`Syntax: ${f}: ${e.stderr}`); } }
let integrityCount=0, manifestFiles=0;
if (artifactMode) {
 const manifest=path.join(root,'MANIFEST.sha256');
 try {
  const listed = new Set();
  for(const line of (await fs.readFile(manifest,'utf8')).trim().split('\n')) {
   const m=line.match(/^([a-f0-9]{64})  (.+)$/); if(!m) { problems.push('Malformed manifest line'); continue; }
   if(listed.has(m[2])) { problems.push(`Duplicate manifest path: ${m[2]}`); continue; }
   listed.add(m[2]); const target=path.resolve(root,m[2]); if(!target.startsWith(root+path.sep)) { problems.push('Manifest traversal'); continue; }
   const actual=createHash('sha256').update(await fs.readFile(target)).digest('hex'); ok(actual===m[1],`Integrity mismatch: ${m[2]}`); integrityCount++;
  }
  const actualFiles = new Set(files.map(f => path.relative(root,f).split(path.sep).join('/')).filter(f => f !== 'MANIFEST.sha256'));
  for (const file of actualFiles) if (!listed.has(file)) problems.push(`Unlisted artifact file: ${file}`);
  for (const file of listed) if (!actualFiles.has(file)) problems.push(`Manifest file missing from artifact: ${file}`);
  manifestFiles = listed.size;
 } catch(e) { if(e.code!=='ENOENT') throw e; }
}
const summary={package:pkg.name,version:pkg.version,files:files.length,tools:defs.length,agents:FAR_AGENTS.length,skills:1,syntaxChecked:syntaxCount,integrityChecked:integrityCount,manifestFiles,artifactMode,liveOmpHost:'NOT_RUN',problems};
console.log(JSON.stringify(summary,null,2)); if(problems.length) process.exitCode=1;
