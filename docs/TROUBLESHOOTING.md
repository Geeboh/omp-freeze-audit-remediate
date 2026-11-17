# Troubleshooting

## `/far` is missing

Link/load the entire package directory, not only the entry file, and start a new OMP session. Check `omp plugin list` and the host's extension errors. Confirm extensions are enabled or the explicit package is supplied. An operator disable/feature allowlist can intentionally hide capabilities. Do not duplicate-copy the extension into several discovery paths as a workaround.

## Tools appear but workers/skill do not

Agents are conventional `agents/*.md`; the skill is exactly `skills/freeze-audit-remediate/SKILL.md`. Load the package root. `/far doctor` reports what the live host can expose. The extension cannot guarantee agents loaded solely because its own factory ran. The adapter tests are mock-contract tests, not proof about the installed host version.

## Goal transition refused

The native API can refuse a busy session, conflicting plan/vibe/goal, disabled goal mode or disabled extension mode control. Interrupt/finish unrelated work normally. FAR never steals a different goal. The launcher uses a fresh native goal and an explicit temporary overlay; `--no-overlay` requires your host configuration to enable it. `--no-goal` is an intentional ordinary turn, not hidden persistent continuation.

## Parallelism is lower than requested

Check dependencies, current leases, overlapping read/write scope, shared resources, native host concurrency and provider limits. Shared editing is limited to one writer without proven native isolation. Static `configs/parallel-safe.yml` caps native workers at four; the launcher generates a matching temporary cap for `--parallel N`. CPU/RAM alone does not establish independent workloads.

## A worker died or was never launched

A task lease is a reservation, not a process supervisor. Reconcile actual native task/job state before settling it. Record the exact outcome as blocked/infrastructure failure, then reopen with new evidence after the prerequisite is restored. Do not submit a second worker while the first may still write. Do not manufacture agent identity or test results to clear the lease.

## State lock or command batch remains after a crash

Use the documented `far` repair-lock or `far_checks` recover action. Only a same-host recorded dead process can be automatically cleared. A live/inaccessible lock is not stolen. On POSIX the check runner terminates its process group on timeout/cancel, but deliberate detachment may leave orphan processes; investigate them rather than assuming cleanup.

## Checks passed earlier but readiness fails now

A source change, check-spec change, executable-bit change, removed/tampered log or newer failing run invalidates evidence. Re-run actual checks on the integrated current snapshot. Re-review changed source and renew consequential finding/final-review records. Do not touch only the timestamps, downgrade mandatory checks or edit state JSON to make it pass.

## Verification mode cannot fix a failure

That is intentional: verification discovers/report defects without product changes. All independent read-only investigation/checking can complete; unresolved release blockers yield NOT_READY. Use explicit remediation/full scope to implement fixes. No manual user testing is needed to manufacture a different outcome.

## A required integration cannot run

Record the actual missing service, credential, platform or hardware and its effect on the declared contract. Continue independent work. A mock can test local assumptions but is not evidence that unavailable hardware passed. Stop blocked once no useful work remains; do not invent QA recipients, external signers or arbitrary mandatory gates.

## Model role unavailable

Inspect `/far models` and OMP's model catalogue/configuration. No provider IDs are guessed. Current mode uses the actual parent model for FAR workers. In auto mode native agent overrides remain authoritative, and an unresolved route can fall back to the parent with a limitation note. Quota/authentication failures are not code defects or reasons to keep retrying a more expensive model.

## Installer refuses a destination

It intentionally refuses existing directories and symlinked ancestors rather than overwriting an installation. Choose a new versioned destination with real directory ancestors. Keep an older linked package until you deliberately switch the link; no updater rewrites active code underneath a running session.
