# Modes and operating model

## Recommended run

Start a fresh OMP session with the package and its explicit optional parallel overlay:

```bash
node "$HOME/.local/share/omp-freeze-audit-remediate-1.0.0/bin/far.mjs" launch full --root /path/to/project --parallel 4 --models auto
```

This starts native OMP with `--extension`, `--config`, `--no-prewalk`, `--yolo` and `--goal`. The launcher creates no model connection of its own. The parent model follows the installed skill and calls the tools.

After linking the package, the interactive alternative is:

```bash
cd /path/to/project
omp --config "$HOME/.local/share/omp-freeze-audit-remediate-1.0.0/configs/parallel-safe.yml" --no-prewalk --yolo
```

```text
/far full --parallel 4 --models auto
```

`/far full` enters native goal mode through the documented API. It does not turn YOLO on or weaken host tool policies; choose YOLO at launch. An unrelated active goal, `/vibe`, plan mode, disabled mode control or a busy host can refuse the transition. FAR will not replace unrelated work. The CLI `launch` uses a fresh native goal session and avoids this ambiguity.

## Five modes

| Command | Product edits | Behavior |
|---|---|---|
| `/far audit` | No | Inventory, parallel source review, findings and scope limits. Completion means audit complete, not release ready. |
| `/far plan` | No | Audit, ordered task graph and project-specific sealed check contract. Checks are planned, not necessarily executed. |
| `/far remediate` | Yes | Work through the existing register, review/integrate fixes, run automated gates and prepare a candidate. |
| `/far verify` | No | Execute checks and review the current snapshot; record defects, but do not repair product code. |
| `/far full` | Yes | Entire freeze/audit/remediation/code-freeze/candidate workflow. |

“No product edits” is an agent policy and scheduler restriction, not an OS sandbox. Tests can create caches and temporary output; writes to inventoried source invalidate their evidence. Install/run only tooling justified by the repository and authorized execution environment.

## Model modes

`--models auto` uses configured OMP agent/model roles. Routine jobs use `@smol`; complex work uses `@default`; consequential jobs use `@slow`. Native per-agent overrides retain precedence. No specific model ID is required to start.

`--models current` pins FAR workers to the actual active parent model. This is the inexpensive single-model option when that model is suitable; it does not certify the model can solve every difficult issue. Risk classification, separate review and gates remain.

The main coordinator is the model you selected in OMP. The plugin does not secretly switch it. Map roles to your available Luna/Sol/Astra choices through OMP's model selector or supported configuration. Inspect `/far models` rather than guessing provider IDs.

## Resume and pause

```text
/far resume
/far pause
/far status
/far report
```

Run state persists in `.far/state.json`; resuming a different session does not require past chat context. Reconcile pending leases with native worker/job state. Never assume a lease whose worker crashed is still producing work. Settle it with the actual failure and reopen only when the prerequisite is restored.

Native `--goal` cannot be combined with `--continue`/`--resume` according to the reviewed CLI. For a fresh session that resumes FAR's disk state, use the launcher normally, then have the agent resume that ledger. To continue an existing native OMP session, use OMP's native continuation and `/far resume` once idle; do not add another `--goal` flag.

`--no-goal` is explicitly a single ordinary OMP turn. It is useful for a bounded audit but is **not** an until-complete promise.

## Completion versus readiness

The ledger may be `active`, `paused`, `blocked` or `complete`. Audit/plan completion has release status `NOT_ASSESSED`.

Remediation/verification/full readiness is:
- `READY`: every declared required gate passed on current evidence.
- `CONDITIONALLY_READY`: the same mandatory gates passed, with documented nonblocking deferred findings.
- `NOT_READY`: a mandatory gate failed, is stale, was not run, or a release blocker remains.

These are engineering decisions for the declared scope, not claims that no bugs exist or that user/hardware testing occurred. No mandatory manual testing/sign-off stage is generated.

## Other OMP modes and add-ons

Use `/goal` for persistence. A separate `/vibe` workflow is unnecessary: native task workers provide parallelism inside the goal. Prewalk is disabled in the launcher because a one-time first-edit handoff is not a risk-based router. Existing pstack, compaction, RTK-style output compression or repository-indexing plugins are not reconfigured by FAR. Preserve raw failing-command diagnostics/evidence when compressing tool output.

## Scope, profile, and escalation options

Use the existing five modes with `--scope path[,path]`, `--base REV`, and `--profile quick|balanced|release`. Use `--escalation never|shelve|ask|always` to govern execution-envelope upgrades. New runs default to `shelve`.

The ledger records lifecycle, outcome, and readiness separately. A shelved or denied prerequisite remains unresolved. A release-ready result names the current source tree and candidate commit.
