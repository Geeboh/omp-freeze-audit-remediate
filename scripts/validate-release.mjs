#!/usr/bin/env node
/** Exercise a generated offline installer. No OMP/provider/model calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const exec=promisify(execFile), input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/validate-release.mjs /path/to/generated-install.mjs');
const installer=path.resolve(input), packageZip=path.join(path.dirname(installer),path.basename(installer).replace(/-install\.mjs$/,'.zip')), tmp=await fs.mkdtemp(path.join(os.tmpdir(),'far-release-check-'));
const checks=[];
const pass=name=>checks.push({name,status:'PASS'});
const run=async(file,args=[],options={})=>exec(process.execPath,[file,...args],{maxBuffer:16*1024*1024,...options}), runCommand=async(command,args=[],options={})=>exec(command,args,{maxBuffer:16*1024*1024,...options});
const hash=b=>createHash('sha256').update(b).digest('hex');
try {
 const dest=path.join(tmp,'installed package');
 await run(installer,[dest]); pass('offline extraction into new directory including spaces');
 const manifest=await fs.readFile(path.join(dest,'MANIFEST.sha256'),'utf8');
 let files=0;
 for(const line of manifest.trim().split('\n')) {
  const [expected,rel]=line.split('  '); assert.equal(hash(await fs.readFile(path.join(dest,rel))),expected,rel); files++;
 }
 assert(files>40); pass('every manifest file matches its SHA-256');
 const zipEntries=JSON.parse((await runCommand('python3',['-c','import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps(sorted(z.namelist())))',packageZip])).stdout);
 assert(zipEntries.length>0 && zipEntries.every(name=>name.startsWith(path.basename(packageZip,'.zip')+'/'))); pass('generated ZIP is readable and path-contained');
 const check=JSON.parse((await run(path.join(dest,'scripts/check-package.mjs'),['--artifact'])).stdout); assert.equal(check.problems.length,0); assert.equal(check.artifactMode,true); assert(check.tools>0 && check.agents>0); pass('extracted package discovery metadata, local links, syntax and exact manifest checks');
 const bunVersion=(await runCommand('bun',['--version'])).stdout.trim(); assert.match(bunVersion,/^\d+\.\d+\.\d+$/); pass(`Bun prerequisite available (${bunVersion})`);
 const help=await run(path.join(dest,'bin/far.mjs'),['help']); assert.match(help.stdout,/Freeze Audit Remediate/); pass('installed standalone CLI help');
 const mod=await exec(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify('file://'+path.join(dest,'src/index.js'))}); if(typeof m.default!=='function') process.exit(1);`]); pass('installed ESM entry imports without third-party dependencies');
 await fs.writeFile(path.join(dest,'preserve-me.txt'),'user-change');
 await assert.rejects(run(installer,[dest])); assert.equal(await fs.readFile(path.join(dest,'preserve-me.txt'),'utf8'),'user-change'); pass('existing destination refused without changing existing files');
 const existingFile=path.join(tmp,'existing-file'); await fs.writeFile(existingFile,'original'); await assert.rejects(run(installer,[existingFile])); assert.equal(await fs.readFile(existingFile,'utf8'),'original'); pass('existing file destination refused');
 const real=path.join(tmp,'real'),link=path.join(tmp,'link'); await fs.mkdir(real); await fs.symlink(real,link,'dir'); await assert.rejects(run(installer,[path.join(link,'new')])); await assert.rejects(fs.access(path.join(real,'new'))); pass('symlinked ancestor refused');
 const original=await fs.readFile(installer,'utf8'); const m=original.match(/const PAYLOAD = ("[^"\n]+");/); assert(m);
 const entries=JSON.parse(gunzipSync(Buffer.from(JSON.parse(m[1]),'base64')).toString());
 async function modified(name,change) {
  const copy=structuredClone(entries); change(copy);
  const payload=JSON.stringify(gzipSync(Buffer.from(JSON.stringify(copy))).toString('base64'));
  const f=path.join(tmp,name+'.mjs'); await fs.writeFile(f,original.replace(m[0],`const PAYLOAD = ${payload};`)); return f;
 }
 const badHash=await modified('bad-hash',es=>{es[0].sha256='0'.repeat(64);});
 const badDest=path.join(tmp,'bad-hash-output'); await assert.rejects(run(badHash,[badDest])); await assert.rejects(fs.access(badDest)); pass('corrupt payload rejected before creating destination');
 const traversal=await modified('bad-path',es=>{es[0].path='../escape';});
 await assert.rejects(run(traversal,[path.join(tmp,'bad-path-output')])); await assert.rejects(fs.access(path.join(tmp,'escape'))); pass('embedded path traversal refused');
 const duplicate=await modified('duplicate',es=>{es.push(es[0]);}); await assert.rejects(run(duplicate,[path.join(tmp,'duplicate-output')])); pass('duplicate embedded filenames refused');
 await run(installer,['--help']); await assert.rejects(run(installer,[])); pass('installer help and invalid-argument behavior');
 console.log(JSON.stringify({installerChecks:checks.length,pass:checks.length,fail:0,manifestFiles:files,checks,liveOmpHost:'NOT_RUN'},null,2));
} finally { await fs.rm(tmp,{recursive:true,force:true}); }
