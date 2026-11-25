import { HELP } from './workflow.mjs';
import { requireThat } from './io.mjs';
export function permission(name, p = {}) {
  if (name === 'far_checks' && p.action === 'run') return 'exec';
  if (name === 'far' && p.action === 'prepare_branch') return 'exec';
  if (name === 'far' && ['help', 'status', 'doctor'].includes(p.action)) return 'read';
  if (name === 'far_tasks' && ['list', 'preview'].includes(p.action)) return 'read';
  if (['far_findings', 'far_checks', 'far_review'].includes(name) && p.action === 'list') return 'read';
  if (name === 'far_gate' && p.action === 'check') return 'read';
  if (name === 'far_models' && p.action === 'status') return 'read';
  return 'write';
}
export async function invoke(engine, name, p, { signal, trusted = false } = {}) {
  switch (name) {
    case 'far':
      switch (p.action) {
        case 'help': return HELP;
        case 'start': return engine.start({ mode: p.mode, parallel: p.parallel, modelMode: p.modelMode, profile: p.profile, scope: p.scope, escalationMode: p.escalationMode });
        case 'status': return engine.status();
        case 'doctor': return engine.doctor();
        case 'report': return engine.report();
        case 'migrate': return engine.migration(p.migrationAction ?? 'inspect', p);
        case 'learning': return engine.learning(p.learningAction ?? 'status', p);
        case 'pause': case 'resume': case 'blocked': case 'cancel': return engine.control(p.action, p.reason);
        case 'configure': return engine.configure(p);
        case 'change_mode': return engine.changeMode(p.mode, p.reason);
        case 'prepare_branch': return engine.prepareBranch();
        case 'repair_lock': return engine.repairLock();
      } break;
    case 'far_inventory':
      if (p.action === 'scan') return engine.inventory();
      if (p.action === 'review') return engine.recordCoverage(p);
      if (p.action === 'boundary') return engine.boundary(p);
      break;
    case 'far_findings':
      if (p.action === 'list') return p.limit !== undefined || p.cursor !== undefined ? engine.listFindings(p) : (await engine.state()).findings;
      if (p.action === 'add') { requireThat(p.finding, 'finding is required'); return engine.addFinding(p.finding); }
      if (p.action === 'update') { requireThat(p.update, 'update is required'); return engine.updateFinding(p.update); }
      break;
    case 'far_tasks':
      if (p.action === 'list') return p.limit !== undefined || p.cursor !== undefined ? engine.listTasks(p) : (await engine.state()).tasks;
      if (p.action === 'seed') return engine.seedAudits();
      if (p.action === 'add') return engine.addTasks(p.tasks);
      if (p.action === 'preview' || p.action === 'claim') return engine.wave({ claim: p.action === 'claim', isolation: p.isolation, limit: p.limit });
      if (p.action === 'settle') return engine.settle(p);
      if (p.action === 'reconcile') return engine.reconcileTask(p);
      if (p.action === 'reopen') return engine.reopenTask(p.id, p.reason);
      break;
    case 'far_checks':
      if (p.action === 'list') { const s = await engine.state(); return p.limit !== undefined || p.cursor !== undefined ? engine.listChecks(p) : { checks: s.checks, runs: s.runs, contract: s.contract }; }
      if (p.action === 'add') { requireThat(p.check, 'check is required'); return engine.addCheck(p.check, p.reason); }
      if (p.action === 'run') return engine.runChecks(p.ids, signal);
      if (p.action === 'seal') return engine.sealContract(p.reason);
      if (p.action === 'recover') return engine.recoverChecks();
      break;
    case 'far_review':
      if (p.action === 'list') return (await engine.state()).reviews;
      if (p.action === 'record') return engine.addReview(p);
      break;
    case 'far_gate':
      if (p.action === 'check') return engine.gates(p.final !== false);
      if (p.action === 'advance') return engine.advance();
      if (p.action === 'finish') return engine.finish();
      break;
    case 'far_models':
      if (p.action === 'status') { const s = await engine.state(false); return { modelMode: s?.options.modelMode ?? 'auto', policy: s?.options.policy ?? null, budget: s?.budget ?? null, hostEnforcement: false, hostRegistry: 'Requires the OMP extension context; CLI cannot resolve authenticated model roles.' }; }
      if (p.action === 'auto' || p.action === 'current') return engine.configure({ modelMode: p.action });
      if (p.action === 'set') return engine.setEscalationMode(p.mode, { trusted });
      if (p.action === 'propose') return engine.proposeEscalation(p);
      if (p.action === 'approve') return engine.approveEscalation(p, { trusted });
      if (p.action === 'deny') return engine.denyEscalation(p, { trusted });
      if (p.action === 'reserve') return engine.reserveEscalation(p);
      if (p.action === 'settle') return engine.settleEscalation(p);
      break;
  }
  throw new Error(`Unknown ${name} action ${p.action}`);
}
