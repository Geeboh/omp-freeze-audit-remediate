import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileAsync } from '../src/io.mjs';
import { fixture, reviewAll } from './helpers.mjs';
import { PACKAGE_ROOT, overlayText } from '../bin/far.mjs';
import { childEnvironment } from '../src/runner.mjs';
import { agentFor, makeTask } from '../src/scheduler.mjs';
const cli=path.join(PACKAGE_ROOT,'bin/far.mjs');
const call=async(root,...args)=>JSON.parse((await execFileAsync(process.execPath,[cli,...args,'--root',root])).stdout);
test('CLI initialization, inventory and status use actual filesystem state',async t=>{
 const {dir}=await fixture(t);
 assert.equal((await call(dir,'init','--mode','audit')).mode,'audit');
 assert.equal((await call(dir,'inventory')).files.length,1);
 assert.equal((await call(dir,'status')).coverage.total,1);
 assert.equal((await call(dir,'doctor')).root,dir);
});
test('CLI launch dry run creates neither ledger nor actual overlay',async t=>{
 const {dir}=await fixture(t);
 const r=await call(dir,'launch','full','--parallel','7','--dry-run');
 assert.match(r.overlay,/maxConcurrency: 7/); assert(r.args.includes('--goal')); assert.equal(r.cwd,dir);
 await assert.rejects(fs.access(path.join(dir,'.far')));
});
test('launcher passes settings through a stub process and removes temporary overlay',async t=>{
 const {dir}=await fixture(t);
 const stub=path.join(dir,'fake-omp.mjs');
 await fs.writeFile(stub,`#!/usr/bin/env node\nimport fs from 'node:fs'; const a=process.argv.slice(2),c=a[a.indexOf('--config')+1]; console.log(JSON.stringify({args:a,config:c,content:fs.readFileSync(c,'utf8'),cwd:process.cwd()}));\n`,{mode:0o755});
 const r=await call(dir,'launch','full','--parallel','7','--omp',stub);
 assert.match(r.content,/maxConcurrency: 7/); assert.match(r.content,/apply: false/); assert.match(r.content,/enabled: true/);
 assert.equal(r.cwd,dir); await assert.rejects(fs.access(r.config));
});
test('CLI request uses engine validation and preserves exit errors',async t=>{
 const {dir}=await fixture(t); await call(dir,'init');
 const req=path.join(dir,'.far/request.json'); await fs.writeFile(req,JSON.stringify({tool:'far_checks',arguments:{action:'add',check:{id:'real-test',argv:[process.execPath,'-e','require("node:assert/strict").equal(2+2,4)'],category:'tests',required:true}}}));
 assert.equal((await call(dir,'request','--file',req)).id,'real-test');
 await fs.writeFile(req,JSON.stringify({tool:'far_checks',arguments:{action:'run'}}));
 const r=await call(dir,'request','--file',req); assert.equal(r.results[0].status,'PASS');
 await fs.writeFile(req,JSON.stringify({tool:'unknown',arguments:{action:'fake'}}));
 await assert.rejects(call(dir,'request','--file',req));
});
test('cross-process finding writes preserve both records',async t=>{
 const {dir,engine}=await fixture(t); await engine.start();
 const files=[];
 for(let i=0;i<2;i++) { const f=path.join(dir,`.far/request-${i}.json`); await fs.writeFile(f,JSON.stringify({tool:'far_findings',arguments:{action:'add',finding:{title:`issue ${i}`,severity:'low',paths:['src/main.js'],evidence:'Fixture source evidence',impact:'Fixture impact',remediation:'Fixture correction'}}})); files.push(f); }
 await Promise.all(files.map(f=>call(dir,'request','--file',f)));
 const s=await engine.state(); assert.equal(s.findings.length,2); assert.equal(new Set(s.findings.map(f=>f.id)).size,2);
});
test('real regression fixture records red, corrected green, and a complete qualified gate',async t=>{
 const {dir,engine}=await fixture(t,{'package.json':'{"type":"module"}\n','src/add.js':'export const add=(a,b)=>a-b;\n','tests/add.test.js':'import test from "node:test"; import assert from "node:assert/strict"; import {add} from "../src/add.js"; test("adds",()=>assert.equal(add(2,3),5));\n'});
 await engine.start(); await reviewAll(engine);
 const finding=await engine.addFinding({title:'Addition subtracts',severity:'medium',paths:['src/add.js'],evidence:'add(2,3) returns -1 instead of 5',impact:'Wrong addition result',remediation:'Use addition and retain regression test'});
 await engine.addCheck({id:'unit',argv:[process.execPath,'--test','tests/add.test.js'],category:'tests',required:true});
 await engine.sealContract('Real fixture assertion validates arithmetic behavior.');
 assert.equal((await engine.runChecks()).results[0].status,'FAIL');
 // A deterministic fixture edit is not a claim that a live model fixed code.
 await fs.writeFile(path.join(dir,'src/add.js'),'export const add=(a,b)=>a+b;\n');
 await reviewAll(engine);
 const {results:runs}=await engine.runChecks(); assert.equal(runs[0].status,'PASS');
 await engine.updateFinding({id:finding.id,status:'verified',reason:'Actual regression assertion now passes',implementer:'fixture-editor',evidenceIds:[runs[0].id]});
 await engine.advance(); await engine.advance();
 await engine.addReview({scope:'final',reviewer:'fixture-review-context',implementer:'fixture-editor',verdict:'approve',evidence:'Deterministic fixture contract inspection',summary:'Fixture implementation and assertion agree; no live model was used.'});
 const final=await engine.finish(); assert.equal(final.readiness,'READY'); assert.equal((await engine.status()).status,'complete');
});
test('test execution tasks have a diagnostics-capable agent and no product writes',()=>{
 const t=makeTask({title:'Run checks',instructions:'Execute bounded diagnostic check',kind:'test',risk:'low',readPaths:['src/main.js']},0);
 assert.equal(agentFor(t),'far-investigator');
 assert.throws(()=>makeTask({title:'Bad test',instructions:'Ambiguous write',kind:'test',writePaths:['src/main.js']},0));
});
test('temporary overlay validates concurrency and never embeds model credentials',()=>{
 assert.throws(()=>overlayText(0)); assert.throws(()=>overlayText(33));
 assert.match(overlayText(8),/maxConcurrency: 8/); assert(!overlayText(8).includes('modelRoles'));
});

test('runner removes inherited Node harness marker without changing parent environment',()=>{
 const previous=process.env.NODE_TEST_CONTEXT; process.env.NODE_TEST_CONTEXT='child-v8';
 try { assert.equal(childEnvironment().NODE_TEST_CONTEXT,undefined); assert.equal(process.env.NODE_TEST_CONTEXT,'child-v8'); }
 finally { if(previous===undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT=previous; }
});
