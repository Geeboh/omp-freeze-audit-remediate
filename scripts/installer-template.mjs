#!/usr/bin/env node
/** Offline, new-destination-only installer. Generated payload is inserted by build-release.py. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const PACKAGE_NAME = '__FAR_PACKAGE_NAME__';
const PAYLOAD = '__FAR_EMBEDDED_PAYLOAD__';
const sha = b => createHash('sha256').update(b).digest('hex');
function need(ok, message) { if (!ok) throw new Error(message); }
async function exists(file) { try { return await fs.lstat(file); } catch(e) { if(e.code === 'ENOENT') return null; throw e; } }
async function parentsAreReal(file) {
  const resolved = path.resolve(file), parsed = path.parse(resolved);
  let current = parsed.root;
  for(const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,part); const st = await exists(current);
    if(st) need(!st.isSymbolicLink() && st.isDirectory(), `Refusing symlink/non-directory ancestor: ${current}`);
  }
}
async function main() {
  const args = process.argv.slice(2);
  if(args.length === 1 && ['--help','-h'].includes(args[0])) { console.log(`Usage: node ${PACKAGE_NAME}-install.mjs NEW_DESTINATION\nOffline extraction only; no network, provider calls, dependency installation or OMP settings changes. Destination must not exist.`); return; }
  need(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 or later is required');
  need(args.length === 1 && !args[0].startsWith('-'), 'Provide exactly one new destination directory; use --help');
  const target = path.resolve(args[0]);
  need(!(await exists(target)), `Destination exists; refusing overwrite: ${target}`);
  await parentsAreReal(path.dirname(target));
  need(PAYLOAD !== '__FAR_' + 'EMBEDDED_PAYLOAD__', 'This is the build template, not the generated installer');
  const entries = JSON.parse(gunzipSync(Buffer.from(PAYLOAD,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));
  need(Array.isArray(entries) && entries.length > 0 && entries.length <= 2000, 'Invalid embedded package');
  const seen = new Set(); let total = 0;
  // Validate all paths and bytes before creating a destination.
  for(const e of entries) {
    need(typeof e.path === 'string' && !e.path.includes('\\') && !e.path.includes('\0') && !path.posix.isAbsolute(e.path) && !/^[A-Za-z]:/.test(e.path), 'Unsafe embedded path');
    need(e.path.split('/').every(p => p && p!=='.' && p!=='..'), 'Embedded path traversal');
    need(!seen.has(e.path), 'Duplicate embedded path'); seen.add(e.path);
    e.bytes = Buffer.from(e.data,'base64'); total += e.bytes.length;
    need(total <= 32*1024*1024 && sha(e.bytes) === e.sha256, `Embedded integrity mismatch: ${e.path}`);
    need([0o644,0o755].includes(e.mode), 'Unexpected embedded mode');
  }
  await fs.mkdir(path.dirname(target),{recursive:true});
  await parentsAreReal(path.dirname(target));
  let created = false;
  try {
    await fs.mkdir(target,{mode:0o700}); created = true;
    for(const e of entries) {
      const out = path.join(target,e.path); await fs.mkdir(path.dirname(out),{recursive:true,mode:0o700});
      await fs.writeFile(out,e.bytes,{flag:'wx',mode:e.mode});
      need(sha(await fs.readFile(out))===e.sha256,`Written integrity mismatch: ${e.path}`);
    }
  } catch(e) { if(created) await fs.rm(target,{recursive:true,force:true}); throw e; }
  console.log(`Installed ${entries.length} verified files to ${target}\nNo OMP configuration changed. Register the whole directory explicitly:\n  omp plugin link ${JSON.stringify(target)}\nThen start a new OMP session, or run:\n  node ${JSON.stringify(path.join(target,'bin/far.mjs'))} launch full --root /path/to/project --parallel 4\nHashes verify integrity, not publisher authenticity. Live OMP-host compatibility is documented in docs/COMPATIBILITY.md.`);
}
main().catch(e=>{ console.error(`FAR installer: ${e.message}`); process.exitCode=1; });
