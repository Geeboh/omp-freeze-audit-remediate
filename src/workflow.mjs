export const HELP = `Freeze Audit Remediate (FAR) 2.1.0-rc.1 — bounded v5 workflow

MODES
  /far audit       Source review and defect register; no product edits.
  /far plan        Audit plus executable remediation/verification plan; no product edits.
  /far remediate   Fix the recorded findings, then verify.
  /far verify      Execute registered checks and independent review; no product edits.
  /far full        Feature freeze -> audit/fixes -> code freeze -> release candidate.
  /far resume      Resume durable state; never discard the previous run.

OPTIONS FOR MODE/RESUME
  --parallel 1..32     Maximum leased tasks/check concurrency.
  --models auto|current Native role routing or current parent model.
  --profile quick|balanced|release  Run qualification profile.
  --scope path[,path]  Limit inventory to explicit repository paths.
  --since REV          Record an explicit delta base revision.
  --escalation MODE    never, shelve, ask, or always. New runs default shelve.
  --no-goal            One ordinary agent turn; NOT an until-complete guarantee.

CONTROL
  /far status | doctor | report | pause | resume | cancel | help
  /far models          Show routing, escalation policy and budgets.
  /far migrate         Inspect schema migration; use explicit apply/restore actions.
  /far learning        Inspect bounded local advisory learning and export status.

DISCOVERY
  Skill: skill://freeze-audit-remediate
  Entry tool: far (essential). More tools: far_inventory, far_findings,
  far_tasks, far_checks, far_review, far_gate, far_models.
  Worker agents: far-auditor, far-fixer, far-investigator,
  far-complex-fixer, far-reviewer, far-deep-fixer, far-deep-reviewer.

RULES
  No user testing. No feature expansion. Preserve existing work.
  Parallelize independent audits/reviews/isolated fixes. Integrate serially.
  Native task performs model execution; FAR leases do not spawn models.
  Escalation approvals bind exact immutable proposals and trusted control events.
  Shelved, denied, deferred, failed and cancelled prerequisites stay unresolved.
  Only far_gate finish can mark the FAR run complete; failed mandatory checks
  never become conditional passes. Audit/plan completion is NOT release readiness.

STATE
  .far/state.json is authoritative. Evidence and reports are derived.
  The CLI provides the same local engine without making model calls.
`;
export function objective(mode, { parallel = 4, modelMode = 'auto', profile = 'balanced', scope, escalationMode = 'shelve' } = {}) {
  const scopeText = scope?.include?.length ? ` scope=${scope.include.join(',')}` : '';
  return `[FAR] Execute ${mode} mode using the installed freeze-audit-remediate skill and FAR tools. Read skill://freeze-audit-remediate first. Initialize or resume the existing ledger with far; maximum parallelism ${parallel}; model mode ${modelMode}; profile ${profile}; escalation ${escalationMode}.${scopeText} Review project instructions and preserve user work. Use native task workers for independent audits/reviews and safely isolated non-overlapping fixes; respect the current task schema, permissions and quotas. Coordinate shared state and integration in the parent. No user testing or routine approval pauses. Continue through every executable task and the mode's gates, not merely a plan. Record real command evidence with far_checks, retain honest limits, and call far_gate finish only after its checks pass.`;
}
export const ACTIVE_CONTEXT = `FAR workflow is active. Read skill://freeze-audit-remediate if not already loaded. The authoritative ledger is .far/state.json; use FAR tools, not manual PASS edits. Only the coordinator mutates the ledger. Parallelize independent analysis and isolated non-overlapping fixes with the native task tool; a leased ticket is not a running worker until native dispatch succeeds. No user testing, feature expansion, destructive Git actions, production deployment or unsolicited release publishing. Audit/plan/verify must not modify product source. Retain real automated evidence and separate actor reviews. Advance/finish through far_gate; never declare release readiness with failed, stale or missing required checks. Continue without stage pauses while executable work remains. Stop honestly when complete or blocked; honor user interrupts and host budgets.`;
export function parseCommand(line) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const command = words.shift() ?? 'help';
  const opts = { goal: true };
  while (words.length) {
    const flag = words.shift();
    if (flag === '--no-goal') opts.goal = false;
    else if (flag === '--parallel') { opts.parallel = Number(words.shift()); if (!Number.isInteger(opts.parallel) || opts.parallel < 1 || opts.parallel > 32) throw new Error('--parallel requires an integer from 1 to 32'); }
    else if (flag === '--models') { opts.modelMode = words.shift(); if (!['auto', 'current'].includes(opts.modelMode)) throw new Error('--models requires auto or current'); }
    else if (flag === '--profile') { opts.profile = words.shift(); if (!['quick', 'balanced', 'release'].includes(opts.profile)) throw new Error('--profile requires quick, balanced or release'); }
    else if (flag === '--scope') { const value = words.shift(); opts.scope = { include: value.split(',').filter(Boolean), dependencyMode: 'conservative' }; if (!opts.scope.include.length) throw new Error('--scope requires one or more paths'); }
    else if (flag === '--since') { opts.scope = { ...(opts.scope ?? {}), since: words.shift() }; }
    else if (flag === '--escalation') { opts.escalationMode = words.shift(); if (!['never', 'shelve', 'ask', 'always'].includes(opts.escalationMode)) throw new Error('--escalation requires never, shelve, ask or always'); }
    else throw new Error(`Unknown option ${flag}. Use /far help.`);
  }
  return { command, opts };
}
