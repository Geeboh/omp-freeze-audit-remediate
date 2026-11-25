#!/usr/bin/env node
/** Standalone local engine and explicit native-OMP launcher. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { FarEngine } from '../src/engine.mjs';
import { invoke } from '../src/actions.mjs';
import { HELP, objective } from '../src/workflow.mjs';
import { MODES } from '../src/gates.mjs';
import { requireThat } from '../src/io.mjs';
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_HELP = `${HELP}\nCLI (Node.js 22+)\n  node bin/far.mjs launch full --root /repo --parallel 4 --models auto --profile release --escalation shelve\n  node bin/far.mjs launch full --root /repo --scope src,tests --since REV --dry-run\n  node bin/far.mjs init --mode audit --root /repo --profile quick\n  node bin/far.mjs status|doctor|inventory|seed|gate|advance|finish|report --root /repo\n  node bin/far.mjs request --file request.json --root /repo [--trusted]\n  node bin/far.mjs prompt full\n\nlaunch opens native OMP with --goal --yolo --no-prewalk and the package's\nparallel-safe per-launch overlay. --no-overlay omits that overlay. --omp PATH selects\nthe omp executable. No project edits, dependency installs or commits occur\nuntil the launched agent takes explicitly authorized development actions.\nrequest JSON: {\"tool\":\"far_checks\",\"arguments\":{\"action\":\"list\"}}\n`;
export function parseArgs(argv) {
  const a = [...argv], cmd = a.shift() ?? 'help';
  const out = { cmd, root: process.cwd(), mode: 'full', modelMode: 'auto', profile: 'balanced', scope: undefined, escalationMode: 'shelve', parallel: 4, omp: 'omp', overlay: true, trusted: false };
  if (['launch', 'prompt'].includes(cmd) && a[0] && !a[0].startsWith('--')) out.mode = a.shift();
  while (a.length) {
    const f = a.shift();
    if (f === '--dry-run') out.dryRun = true;
    else if (f === '--no-overlay') out.overlay = false;
    else if (f === '--trusted') out.trusted = true;
    else if (f === '--profile') { out.profile = a.shift(); requireThat(['quick', 'balanced', 'release'].includes(out.profile), '--profile must be quick, balanced or release'); }
    else if (f === '--scope') { const value = a.shift(); out.scope = { include: value.split(',').filter(Boolean), dependencyMode: 'conservative' }; requireThat(out.scope.include.length > 0, '--scope requires one or more paths'); }
    else if (f === '--since') { out.scope = { ...(out.scope ?? {}), since: a.shift() }; }
    else if (f === '--escalation') { out.escalationMode = a.shift(); requireThat(['never', 'shelve', 'ask', 'always'].includes(out.escalationMode), '--escalation must be never, shelve, ask or always'); }
    else if (['--root', '--mode', '--models', '--parallel', '--file', '--omp'].includes(f)) {
      requireThat(a.length > 0, `Missing ${f} value`); const v = a.shift();
      const k = { '--root': 'root', '--mode': 'mode', '--models': 'modelMode', '--parallel': 'parallel', '--file': 'file', '--omp': 'omp' }[f]; out[k] = k === 'parallel' ? Number(v) : v;
    } else throw new Error(`Unknown argument ${f}`);
  }
  requireThat(MODES.includes(out.mode), 'Invalid mode');
  requireThat(['auto', 'current'].includes(out.modelMode), 'Invalid model mode');
  requireThat(Number.isInteger(out.parallel) && out.parallel >= 1 && out.parallel <= 32, '--parallel must be 1..32');
  return out;
}
export function overlayText(parallel) {
  requireThat(Number.isInteger(parallel) && parallel >= 1 && parallel <= 32, 'Invalid concurrency');
  return `# FAR per-launch settings; no persistent OMP configuration changes.\ngoal:\n  enabled: true\ntask:\n  batch: true\n  maxConcurrency: ${parallel}\n  isolation:\n    enabled: true\n    apply: false\n    merge: patch\n`;
}
export function launchArgs(opts) {
  return ['--extension', PACKAGE_ROOT, ...(opts.overlay ? ['--config', opts.configPath ?? path.join(PACKAGE_ROOT, 'configs/parallel-safe.yml')] : []), '--no-prewalk', '--yolo', '--goal', objective(opts.mode, opts)];
}
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.cmd === 'help' || opts.cmd === '--help' || opts.cmd === '-h') { console.log(CLI_HELP); return; }
  if (opts.cmd === 'prompt') { console.log(objective(opts.mode, opts)); return; }
  const engine = await FarEngine.open(opts.root);
  if (opts.cmd === 'launch') {
    if (opts.dryRun) {
      console.log(JSON.stringify({ executable: opts.omp, args: launchArgs({ ...opts, configPath: '<temporary-per-launch-overlay.yml>' }), overlay: opts.overlay ? overlayText(opts.parallel) : null, cwd: engine.root, note: 'Dry run: no OMP process, overlay file or FAR state was created.' }, null, 2)); return;
    }
    // Preserve any existing run. This explicit launcher authorizes only a temporary
    // settings overlay, never an edit to the user's global/project OMP config.
    let temp;
    try {
      if (opts.overlay) {
        temp = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-far-launch-'));
        opts.configPath = path.join(temp, 'config.yml');
        await fs.writeFile(opts.configPath, overlayText(opts.parallel), { flag: 'wx', mode: 0o600 });
      }
      const child = spawn(opts.omp, launchArgs(opts), { cwd: engine.root, stdio: 'inherit', shell: false });
      process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (c, signal) => resolve(c ?? (signal ? 130 : 1))); });
    } finally { if (temp) await fs.rm(temp, { recursive: true, force: true }); }
    return;
  }
  let output;
  if (opts.cmd === 'init') output = await engine.start(opts);
  else if (opts.cmd === 'request') {
    requireThat(opts.file, 'request requires --file');
    let raw;
    if (opts.file === '-') { const chunks = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); raw = Buffer.concat(chunks).toString('utf8'); }
    else raw = await fs.readFile(path.resolve(opts.file), 'utf8');
    const input = JSON.parse(raw);
    requireThat(typeof input.tool === 'string' && input.arguments && typeof input.arguments === 'object', 'Request requires tool and arguments');
    output = await invoke(engine, input.tool, input.arguments, { trusted: opts.trusted });
  } else {
    const actions = { status: ['far', 'status'], doctor: ['far', 'doctor'], inventory: ['far_inventory', 'scan'], seed: ['far_tasks', 'seed'], gate: ['far_gate', 'check'], advance: ['far_gate', 'advance'], finish: ['far_gate', 'finish'], report: ['far', 'report'], migrate: ['far', 'migrate'], learning: ['far', 'learning'], resume: ['far', 'resume'], pause: ['far', 'pause'], cancel: ['far', 'cancel'] };
    requireThat(actions[opts.cmd], 'Unknown command. Use help.');
    output = await invoke(engine, actions[opts.cmd][0], { action: actions[opts.cmd][1] });
  }
  console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(JSON.stringify({ error: e.message, code: e.code ?? 'FAR_ERROR' })); process.exitCode = 1; });
