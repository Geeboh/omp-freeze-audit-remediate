export const HELP = `Freeze Audit Remediate (FAR) 1.0.0 — reviewed v4.1 workflow

MODES
  /far audit       Source review and defect register; no product edits.
  /far plan        Audit plus executable remediation/verification plan; no product edits.
  /far remediate   Fix the recorded findings, then verify.
  /far verify      Execute registered checks and independent review; no product edits.
  /far full        Feature freeze -> audit/fixes -> code freeze -> release candidate.
  /far resume      Resume durable state; never discard the previous run.

OPTIONS FOR MODE/RESUME
  --parallel 1..32     Maximum leased tasks/check concurrency (default up to 4).
  --models auto       Native OMP roles: @smol / @default / @slow (default).
  --models current    Keep every FAR worker on the current parent model.
  --no-goal           One ordinary agent turn; NOT an until-complete guarantee.

CONTROL
  /far status | doctor | report | pause | help
  /far models          Show actual configured role resolution.

DISCOVERY
  Skill: skill://freeze-audit-remediate
  Entry tool: far (essential). More tools: far_inventory, far_findings,
  far_tasks, far_checks, far_review, far_gate, far_models.
  Worker agents: far-auditor, far-fixer, far-investigator,
  far-complex-fixer, far-reviewer, far-deep-fixer, far-deep-reviewer.

RULES
  No user testing. No feature expansion. Preserve existing work.
  Parallelize independent audits/reviews/isolated fixes. Integrate serially.
  Native task performs model execution; FAR leases do not spawn workers.
  Only far_gate finish can mark the FAR run complete; failing mandatory checks
  never become conditional passes. Audit/plan completion is NOT release readiness.

STATE
  .far/state.json (authoritative), .far/evidence/, .far/reports/.
  The CLI provides the same local engine without making model calls.
`;
export function objective(mode, { parallel = 4, modelMode = 'auto' } = {}) {
  return `[FAR] Execute ${mode} mode using the installed freeze-audit-remediate skill and FAR tools. Read skill://freeze-audit-remediate first. Initialize or resume the existing ledger with far; maximum parallelism ${parallel}; model mode ${modelMode}. Review project instructions and preserve user work. Use native task workers for independent audits/reviews and safely isolated non-overlapping fixes; respect the current task schema, permissions and quotas. Coordinate shared state and integration in the parent. No user testing or routine approval pauses. Continue through every executable task and the mode's gates, not merely a plan. Record real command evidence with far_checks, retain honest limits, and call far_gate finish only after its checks pass. In full/remediate/verify modes, advance through code freeze and release candidate. If nothing executable remains, report BLOCKED/NOT_READY with exact evidence, pause the native goal using its supported interface, and stop retrying; do not claim success. Honor user stop/pause and host budget limits. The detailed workflow and tools are in the skill; do not invent model selectors or test results.`;
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
    else throw new Error(`Unknown option ${flag}. Use /far help.`);
  }
  return { command, opts };
}
