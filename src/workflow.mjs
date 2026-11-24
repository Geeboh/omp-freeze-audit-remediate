export const HELP = `Freeze Audit Remediate (FAR) 2.0.0-rc.1 — bounded resumable workflow

MODES
  /far audit       Source review and defect register; no product edits.
  /far plan        Audit plus executable action coverage and verification plan.
  /far remediate   Fix recorded findings, then verify.
  /far verify      Execute registered checks and independent review; no edits.
  /far full        Feature freeze -> audit/fixes -> code freeze -> release candidate.
  /far resume      Resume durable state; preserve budgets, approvals and counters.

OPTIONS
  --parallel 1..32     Maximum leased tasks/check concurrency.
  --models auto|current Native role routing or current parent model.
  --profile quick|balanced|release   Verification and convergence profile.
  --scope path[,path]  Explicit repository-relative scope.
  --base REV           Explicit delta baseline revision.
  --escalation MODE    never, shelve, ask or always. New-run default shelve.
  --no-goal            One ordinary agent turn; not an until-complete guarantee.

CONTROL
  /far status | doctor | report | pause | resume | cancel | help
  /far escalation status|set MODE
  /far shelf list|show ID|approve ID|deny ID|retry TASK_ID
  /far models          Show actual configured role resolution.

DISCOVERY
  Skill: skill://freeze-audit-remediate
  Entry tool: far (essential). More tools: far_inventory, far_findings,
  far_tasks, far_checks, far_review, far_gate, far_models.
  Worker agents: far-auditor, far-fixer, far-investigator,
  far-complex-fixer, far-reviewer, far-deep-fixer, far-deep-reviewer.

RULES
  No user testing, feature expansion, destructive Git actions or invented host claims.
  Native task performs model execution; FAR leases do not spawn workers.
  Only far_gate finish can mark the FAR run complete. Shelved, denied, failed or
  deferred prerequisites stay unresolved. Plan/audit completion is not readiness.

STATE
  .far/state.json is authoritative. Evidence logs and reports are derived.
  The CLI uses the same engine without making model calls.
`;
export function objective(mode, { parallel = 4, modelMode = 'auto', profile = 'balanced', escalationPolicy = 'shelve', scope = null, base = null } = {}) {
  return `[FAR] Execute ${mode} mode using skill://freeze-audit-remediate and the FAR tools. Initialize or resume the existing ledger with maximum parallelism ${parallel}, model mode ${modelMode}, profile ${profile}, escalation policy ${escalationPolicy}, scope ${JSON.stringify(scope)}, delta base ${base ?? 'none'}. Review project instructions and preserve user work. Use native task workers for independent audits/reviews and safely isolated non-overlapping fixes; respect actual task schema, permissions, policy, budgets and host capabilities. Coordinate shared state and integration in the parent. No user testing or routine approval pauses. Continue through executable tasks and mode gates. Record real command evidence, current authoritative reviews and conservative input manifests. Call far_gate finish only after checks pass. If only shelved, denied or blocked work remains, record the outcome and pause or close honestly; do not self-prompt or claim success. Honor user stop, cancellation and host limits.`;
}
export const ACTIVE_CONTEXT = `FAR workflow is active. Read skill://freeze-audit-remediate if not already loaded. The authoritative ledger is .far/state.json; use FAR tools, not manual PASS edits. Only the coordinator mutates the ledger. Parallelize independent analysis and isolated non-overlapping fixes with the native task tool; a lease is not a worker execution until native dispatch succeeds. No user testing, feature expansion, destructive Git actions, production deployment or unsolicited publishing. Audit/plan/verify must not modify product source. Retain real evidence and separate reviews. Advance/finish through far_gate; never declare readiness with failed, stale, unresolved or missing required evidence. Continue while executable work remains. Stop honestly when complete, paused, blocked, cancelled or budget/convergence limited.`;
export function parseCommand(line) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const command = words.shift() ?? 'help';
  const opts = { goal: true };
  if (['escalation', 'shelf'].includes(command) && words.length && !words[0].startsWith('--')) opts.subcommand = words.shift();
  if (opts.subcommand === 'set' && words.length && !words[0].startsWith('--')) opts.policy = words.shift();
  if (['show', 'approve', 'deny', 'retry'].includes(opts.subcommand) && words.length && !words[0].startsWith('--')) opts.id = words.shift();
  while (words.length) {
    const flag = words.shift();
    if (flag === '--no-goal') opts.goal = false;
    else if (flag === '--parallel') { opts.parallel = Number(words.shift()); if (!Number.isInteger(opts.parallel) || opts.parallel < 1 || opts.parallel > 32) throw new Error('--parallel requires an integer from 1 to 32'); }
    else if (flag === '--models') { opts.modelMode = words.shift(); if (!['auto', 'current'].includes(opts.modelMode)) throw new Error('--models requires auto or current'); }
    else if (flag === '--profile') { opts.profile = words.shift(); if (!['quick', 'balanced', 'release'].includes(opts.profile)) throw new Error('--profile requires quick, balanced or release'); }
    else if (flag === '--scope') { const value = words.shift(); opts.scope = { paths: value.split(',').filter(Boolean), explicit: true }; if (!opts.scope.paths.length) throw new Error('--scope requires one or more paths'); }
    else if (flag === '--base') { opts.base = words.shift(); if (!opts.base) throw new Error('--base requires a revision'); }
    else if (flag === '--escalation') { opts.escalationPolicy = words.shift(); if (!['never', 'shelve', 'ask', 'always'].includes(opts.escalationPolicy)) throw new Error('--escalation requires never, shelve, ask or always'); }
    else throw new Error(`Unknown option ${flag}. Use /far help.`);
  }
  return { command, opts };
}
