import { HELP } from './workflow.mjs';
import { requireThat } from './io.mjs';
import { paginate } from './pagination.mjs';

function listed(items, p, revision = null) {
  return p.cursor || p.limit != null ? paginate(items, { cursor: p.cursor ?? null, limit: p.limit ?? 50, revision }) : items;
}

export function permission(name, p = {}) {
  if (name === 'far_checks' && p.action === 'run') return 'exec';
  if (name === 'far' && p.action === 'prepare_branch') return 'exec';
  if (name === 'far' && ['help', 'status', 'doctor', 'escalation_status', 'shelf_list', 'shelf_show'].includes(p.action)) return 'read';
  if (name === 'far_tasks' && ['list', 'preview'].includes(p.action)) return 'read';
  if (['far_findings', 'far_checks', 'far_review'].includes(name) && p.action === 'list') return 'read';
  if (name === 'far_gate' && p.action === 'check') return 'read';
  if (name === 'far_models' && p.action === 'status') return 'read';
  return 'write';
}

export async function invoke(engine, name, p, { signal, trustedOrigin = null, trustedActor = null } = {}) {
  switch (name) {
    case 'far':
      switch (p.action) {
        case 'help': return HELP;
        case 'start': return engine.start({ mode: p.mode, parallel: p.parallel, modelMode: p.modelMode, profile: p.profile, scope: p.scope, escalationPolicy: p.escalationPolicy });
        case 'status': return engine.status();
        case 'doctor': return engine.doctor();
        case 'report': return engine.report();
        case 'pause': case 'resume': case 'blocked': case 'cancel': return engine.control(p.action, p.reason);
        case 'configure': return engine.configure(p);
        case 'change_mode': return engine.changeMode(p.mode, p.reason);
        case 'prepare_branch': return engine.prepareBranch();
        case 'repair_lock': return engine.repairLock();
        case 'escalation_propose': return engine.requestEscalation({ taskId: p.taskId, proposed: p.envelope, problem: { reason: p.reason ?? 'explicit escalation proposal' }, evidence: p.evidence ? [p.evidence] : [] });
        case 'escalation_set': return engine.setEscalationPolicy(p.policy, { origin: trustedOrigin ?? 'untrusted', actor: trustedActor ?? 'unknown' });
        case 'shelf_list': return engine.shelfList(p);
        case 'shelf_show': return engine.shelfShow(p.requestId);
        case 'shelf_approve': return engine.approveEscalation(p.requestId, { origin: trustedOrigin ?? 'untrusted', actor: trustedActor ?? 'unknown', limits: p.limits, maxUses: p.maxUses });
        case 'shelf_deny': return engine.denyEscalation(p.requestId, p.reason, { origin: trustedOrigin ?? 'untrusted' });
        case 'shelf_retry': return engine.shelfRetry(p.taskId, p.reason);
        case 'migrate': return engine.migrate({ dryRun: p.dryRun !== false });
        case 'checkpoint': return engine.checkpoint(p.reason);
      } break;
    case 'far_inventory':
      if (p.action === 'scan') return engine.inventory();
      if (p.action === 'review') return engine.recordCoverage(p);
      if (p.action === 'boundary') return engine.boundary(p);
      break;
    case 'far_findings': {
      const s = await engine.state();
      if (p.action === 'list') return listed(s.findings, p, s.revision);
      if (p.action === 'add') { requireThat(p.finding, 'finding is required'); return engine.addFinding(p.finding); }
      if (p.action === 'update') { requireThat(p.update, 'update is required'); return engine.updateFinding(p.update); }
      break;
    }
    case 'far_tasks': {
      const s = await engine.state();
      if (p.action === 'list') return listed(s.tasks, p, s.revision);
      if (p.action === 'seed') return engine.seedAudits();
      if (p.action === 'plan') return engine.recordPlanAction(p);
      if (p.action === 'preview' || p.action === 'claim') return engine.wave({ claim: p.action === 'claim', isolation: p.isolation, limit: p.limit });
      if (p.action === 'settle') return engine.settle(p);
      if (p.action === 'reopen') return engine.reopenTask(p.id, p.reason);
      break;
    }
    case 'far_checks':
      if (p.action === 'list') { const s = await engine.state(); return { checks: listed(s.checks, p, s.revision), runs: listed(s.runs, p, s.revision), contract: s.contract }; }
      if (p.action === 'add') { requireThat(p.check, 'check is required'); return engine.addCheck(p.check, p.reason); }
      if (p.action === 'run') return engine.runChecks(p.ids, signal);
      if (p.action === 'seal') return engine.sealContract(p.reason);
      if (p.action === 'recover') return engine.recoverChecks();
      break;
    case 'far_review':
      if (p.action === 'list') { const s = await engine.state(); return listed(s.reviews, p, s.revision); }
      if (p.action === 'record') return engine.addReview(p);
      break;
    case 'far_gate':
      if (p.action === 'check') return engine.gates(p.final !== false);
      if (p.action === 'advance') return engine.advance();
      if (p.action === 'finish') return engine.finish();
      break;
    case 'far_models':
      if (p.action === 'auto' || p.action === 'current') return engine.configure({ modelMode: p.action });
      if (p.action === 'status') return { modelMode: (await engine.state(false))?.options.modelMode ?? 'auto', hostRegistry: 'Requires the OMP extension context; CLI cannot resolve authenticated model roles.' };
      break;
  }
  throw new Error(`Unknown ${name} action ${p.action}`);
}
