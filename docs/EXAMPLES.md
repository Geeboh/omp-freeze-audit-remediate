# Examples

Run launch commands in an interactive terminal. Replace `/path/to/project` with the actual repository. Examples of evidence/actor IDs are templates, never evidence to copy literally.

## Full freeze with parallel workers

```bash
FAR="$HOME/.local/share/omp-freeze-audit-remediate-2.0.0-rc.1"
node "$FAR/bin/far.mjs" launch full --root /path/to/project --parallel 4 --models auto --profile release --escalation shelve
```

The launcher loads the whole package even without a persistent link. It creates an explicit temporary settings overlay with the matching native worker cap, native isolation and no automatic patch application. The coordinator still limits jobs by conflicts and dependencies.

Use a larger cap when the repository/environment/provider supports it:

```bash
node "$FAR/bin/far.mjs" launch full --root /path/to/project --parallel 8 --models auto
```

This is a concurrency ceiling, not a throughput or cost guarantee.

## Use only the selected model

```bash
node "$FAR/bin/far.mjs" launch full --root /path/to/project --parallel 4 --models current
```

Select your intended parent model through OMP first. FAR keeps workers on that actual selector, still separates implementation/review contexts and does not claim the model can solve every issue.

## Audit, then plan, then implement

In a properly loaded idle OMP session:

```text
/far audit --parallel 6
```

After the audit goal finishes:

```text
/far plan --parallel 6
```

After the plan goal finishes:

```text
/far remediate --parallel 6
```

The implementation mode change is explicit and preserves findings. The shared host cap can be lower; use the launcher with the same `--parallel 6` for a matching session cap. There is no automatic human approval gate between stages in full mode; this three-command example intentionally selects separate scopes.

## Verification only

```bash
node "$FAR/bin/far.mjs" launch verify --root /path/to/project --parallel 4
```

No intended product-code edits. Run existing project validation, record failures and produce an honest not-ready outcome if they cannot be fixed in this mode. A new repository still needs its actual scope, check contract and source assessment; verification does not mean inventing prior audit evidence.

## Resume after a session stops

For a fresh OMP session, use the same full launcher. Its generated objective directs the coordinator to reconcile and resume `.far/state.json`. It does not erase an unfinished ledger.

To use native OMP session continuation:

```bash
cd /path/to/project
omp --continue --no-prewalk --approval-mode=yolo
```

Once idle, with the plugin linked:

```text
/far resume
```

Do not combine native `--goal` with `--continue`/`--resume`. Before reclaiming a task, reconcile actual worker state. A running lease is not automatically reusable merely because another session is reading it.

## Pause and inspect

Interrupt active work using the host's normal stop control when necessary, then:

```text
/far pause
/far status
/far report
```

Read `.far/reports/README.md` and the linked inventory, findings, verification and continuation reports. Reports are derived from the ledger; do not edit PASS results into them.

## Bounded ordinary turn

```text
/far audit --no-goal
```

This explicitly avoids continuous goal mode. It is useful for a short agent-directed inspection, not an until-complete guarantee.

## Native parallel task dispatch (agent-facing)

First register and claim tasks through `far_tasks`. Inspect the host's actual native `task` schema. The reviewed upstream batch shape is:

```json
{
  "context": "FAR audit wave. Read the installed freeze-audit-remediate skill; execute only your bounded assignment. Return source evidence and limitations to the coordinator. Do not edit .far or launch a new goal.",
  "tasks": [
    {"name":"parser-audit","agent":"far-auditor","task":"Review src/parser.js for boundary and error-path defects. Read only; return findings with lines and reproduction suggestions.","solutionSpace":"Only src/parser.js and its immediate documented contracts; no product edits."},
    {"name":"storage-audit","agent":"far-auditor","task":"Review src/storage.js for lifecycle and failure handling. Read only; return evidence-backed findings.","solutionSpace":"Only src/storage.js and its documented storage contracts; no product edits."}
  ]
}
```

Use actual claimed tasks and their `assignedAgent`, not these fictional paths. An isolated fix item additionally uses `isolated:true` only when the current schema exposes it. With `task.isolation.apply=false`, inspect the resulting artifact/patch, integrate it serially, rerun affected checks, then settle the lease. Never mark an unapplied patch as an integrated fix.

## Register and execute an actual test command

For an npm repository whose test script is confirmed meaningful, the corresponding tool call is:

```json
{"action":"add","check":{"id":"unit","title":"Repository unit tests","argv":["npm","test"],"category":"tests","required":true,"timeoutMs":120000}}
```

Seal only after assessing all required project checks; then run and inspect output:

```json
{"action":"seal","reason":"Repository build/test instructions and critical paths determine this verification contract."}
```

```json
{"action":"run","ids":["unit"]}
```

Parallel-safe declaration example: two check commands with independent fixture/database/output directories may use distinct resource labels such as `test-unit-fixtures` and `test-parser-fixtures`. Marking identical shared databases with different labels does not make them independent. Uncertain checks remain serial.

## Standalone local inspection

```bash
node "$FAR/bin/far.mjs" doctor --root /path/to/project
node "$FAR/bin/far.mjs" status --root /path/to/project
node "$FAR/bin/far.mjs" gate --root /path/to/project
node "$FAR/bin/far.mjs" report --root /path/to/project
```

These do not invoke a provider or start remediation. `doctor` can work before a run exists; gate/report require an existing ledger. The CLI is a diagnostic/local-engine interface, not a second independent AI orchestrator.

## Existing custom OMP configuration

```bash
node "$FAR/bin/far.mjs" launch full --root /path/to/project --parallel 4 --no-overlay
```

Your host must already enable goal mode and the desired task capabilities. FAR will not guess missing flags, silently alter global settings or claim unsupported parallelism. Native limitations are reported and a single shared writer remains the safe fallback.
