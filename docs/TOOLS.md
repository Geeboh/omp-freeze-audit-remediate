# Tool reference

These are real registered extension tools, not proposed names. The active OMP schema is authoritative. Discover a tool before calling it if your host uses deferred tool loading. `far` is essential and points to the other seven tools and `skill://freeze-audit-remediate`.

Only the coordinator mutates shared state. Read actions use read approval, ledger mutations use write approval, and command execution/branch preparation use exec approval. Host policy still applies under YOLO. A tool error is returned as an error, never a fabricated PASS. Tool display output is bounded; complete records stay under `.far`.

## far

Actions: `help`, `start`, `status`, `doctor`, `report`, `pause`, `resume`, `blocked`, `configure`, `change_mode`, `prepare_branch`, `repair_lock`.

`start` accepts `mode`, `parallel` (1–32) and `modelMode` (`auto`/`current`). `configure` changes the latter two. `change_mode` requires a valid mode and an explicit `reason`; it preserves history and returns to feature-freeze. `blocked` requires a reason and refuses while runnable/running work remains. `prepare_branch` checks for a clean Git working tree (FAR's own state excluded); it does not stash, reset, stage or commit. `repair_lock` can clear only a recorded same-host dead process lock; it never steals a live lock.

```json
{"action":"start","mode":"full","parallel":4,"modelMode":"auto"}
```

`far` start initializes the engine; unlike `/far full`, a tool call does not enter native goal mode. The CLI/slash interface handles that session operation.

## far_inventory

Actions: `scan`, `review`, `boundary`.

`scan` records current scope/hashes and project-specific check suggestions without executing those commands. `review` requires exact `paths`, an actual `reviewer` identifier, `evidence` and a `summary`. Only record this after a source review; filenames alone are insufficient. The review is bound to each file's content, kind and executable bit.

```json
{"action":"review","paths":["src/parser.js"],"reviewer":"actual-worker-id","evidence":"actual transcript or source reference","summary":"Reviewed parsing bounds and error paths; remaining concern recorded separately."}
```

`boundary` requires `path`, `rationale` and `evidence` for an inventoried external tree/special entry. The declaration explicitly says integration-only, not recursive internal review. Replace example identifiers with actual execution identities and references; do not submit placeholders as evidence.

## far_findings

Actions: `list`, `add`, `update`.

`add.finding`: `title`, `severity` (`critical/high/medium/low`), `classification` (`confirmed/suspected/debt/test-gap/documentation/opportunity`), `category`, `paths`, `evidence`, `impact`, `remediation`, optional `releaseBlocking`. Critical/high are always release-blocking. IDs are generated.

`update.update`: `id`, `status` (`open/in_progress/fixed/verified/blocked/deferred/dismissed`), `reason`, optional `evidenceIds`, `reviewId`, `implementer`, `commits`.

A fixed finding is not verified. Verification needs at least one actual fresh passing command record and the actual implementer. A consequential fix also needs a current different-reviewer record covering that finding or the final snapshot. Release blockers cannot be deferred; dismissing one needs a current separate review. A later source change requires renewed evidence, not silently carried-forward verification.

## far_tasks

Actions: `list`, `seed`, `add`, `preview`, `claim`, `settle`, `reopen`.

`seed` creates bounded audit tasks from the current inventory and avoids duplicate audit scopes. `add.tasks` contains records with `title`, `instructions`, `kind`, optional `id`, `risk`, `readPaths`, `writePaths`, `dependsOn`, `resources`, `priority`. Kinds are `audit/fix/review/test/document`. Use `fix` for creating test code; `test` means executing/investigating tests without intended source edits. Risk starts at low/economy, medium/standard or high/deep. Lower numeric priority runs first. Dependencies may reference existing or same-batch IDs; cycles and unknown IDs are rejected.

Scopes use literal relative paths/prefixes, not globs. `readPaths:["."]` permits repository-wide reads. Write scope cannot be the whole repository or `.far`. Audits/reviews/tests have no product write scope. `resources` names external/shared constraints; `"*"` is exclusive.

`preview` and `claim` accept `isolation` and `limit`. Set isolation true only after confirming native task isolation and patch-capture behavior. `claim` returns leases and `assignedAgent`; **it does not spawn workers**. Dispatch each ticket through native `task`. Settle each exact `id`/`lease` with `outcome` (`done/failed/blocked`), observed `summary`, and `infrastructure=true` when applicable. Reopening requires a new `reason` and never silently reclaims a live worker.

## far_checks

Actions: `list`, `add`, `seal`, `run`, `recover`.

`add.check`: `id`, optional `title`, executable `argv` array, relative `cwd` (default `.`), `category` (`build/tests/static/security/package/benchmark/validation`), `required`, `timeoutMs`, `parallelSafe`, `resources`.

```json
{"action":"add","check":{"id":"unit","argv":["npm","test"],"category":"tests","required":true,"timeoutMs":120000}}
```

Use this only for an actual npm project with a meaningful test script. Shell operators are not expanded. For Python use the project's virtual-environment executable; for shell scripts use an explicit reviewed shell/script argv. Commands execute trusted project code and are **not sandboxed**. Check results must be semantically reviewed for assertions/test discovery, not merely exit zero.

`seal` takes a rationale `reason`; it requires at least one required tests/validation check. Editing a sealed spec requires an explicit reason and unseals it; reseal before completion. `run.ids` selects commands, or omit to run all. Serial is default. Parallel-safe commands require explicit resource declarations, and exclusive commands preserve order. Logs are bounded/redacted with hashes; result metadata contains exit/status/timing/source/spec identities. `recover` clears only a dead same-host command-batch lease, not processes still running elsewhere.

## far_review

Actions: `list`, `record`.

`record`: `scope` (`batch/final`), `reviewer`, `implementer`, `verdict` (`approve/changes_required`), actual `evidence`, `summary`, optional `findingIds`.

Run a separate reviewer first. Use actual context IDs; changing a string does not create an independent review. This is deliberately an attestation mechanism, not a cryptographic trust/authentication service. A separate context using the same model is allowed. Record against the integrated current snapshot.

## far_gate

Actions: `check`, `advance`, `finish`.

`check` returns named criteria and readiness; `final:false` excludes final-review/candidate-stage checks while inspecting transition readiness. `advance` progresses feature-freeze → code-freeze → release-candidate only after applicable evidence gates pass. `finish` persists completion only after all mode-specific requirements pass. Audit/plan completion never asserts a release candidate.

Mandatory check evidence must be current, successful and intact. Open workers, missing review coverage, unresolved findings and stale evidence are visible failures. Conditional readiness cannot hide any failed required gate. The tool does not intercept OMP's native goal-completion tool: the installed skill requires `far_gate.finish` before the coordinator completes that native goal.

## far_models

Actions: `status`, `auto`, `current`.

`status` reads the actual live host registry, current parent model and role resolution where available. CLI diagnostics cannot resolve authenticated host models and say so. `auto` retains native model selection/overrides; `current` pins FAR workers through the documented pre-spawn hook to the actual parent selector. Neither action changes the parent model or global config. Provider fallback and complexity escalation are distinct.

## Standalone JSON requests

Every engine tool action is also available through the CLI; live host model diagnostics and session transitions are not:

```bash
node /path/to/plugin/bin/far.mjs request --root /path/to/repo --file request.json
```

`request.json` wraps the normal arguments:

```json
{"tool":"far_checks","arguments":{"action":"list"}}
```

The CLI returns JSON and exits nonzero on errors. It never executes a model, recursively calls OMP or interprets slash-command strings.
