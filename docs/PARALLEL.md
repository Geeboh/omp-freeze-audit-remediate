# Parallel execution

## Implemented scheduling

FAR's engine maintains a task DAG and issues bounded ready waves. Every task has a kind, risk tier, prerequisite IDs, literal read/write path prefixes, shared-resource labels, priority and status. A claimed task receives a unique lease. Concurrent claims are protected by the state lock and cannot lease the same pending task twice.

Read-only audits can share source files. Overlapping writes, read/write overlaps and shared resource labels conflict. Two writers without confirmed isolation always serialize, even when their apparent file scopes differ. Isolated writers with disjoint scopes/resources can run together. Patches that touch the same paths still serialize to avoid predictable integration conflict.

The default cap is up to four workers; valid configured caps are 1–32. This is a ceiling, not a requirement to fill every slot. Native OMP, provider quotas, hardware and other agent workloads can impose tighter limits. The planner does not infer a safe memory budget or provider rate limit from CPU count.

## Dispatch protocol

1. Add/seed tasks with narrow ownership and required tests.
2. Call `far_tasks preview` to inspect the next wave without changing state.
3. Call `far_tasks claim` to reserve a wave.
4. Use native `task` with the returned agent and assignment. Inspect the actual live task schema first. The documented current batch shape uses a required `context` and per-item `tasks[]`.
5. For editing tickets, use native `isolated:true` only when available. The provided overlay sets `task.isolation.apply:false`, so captures are not blindly merged into the parent's tree.
6. Collect and inspect results; independently review material changes.
7. Integrate patches serially through native Git/edit tools; run affected checks against the combined result, not only each isolated branch.
8. Import findings/coverage/review attestations and settle each lease.

FAR deliberately does not call an undocumented model-spawn API, create a second worker pool, or invent worker IDs. It is the scheduler/ledger around OMP's native execution.

## Shared resources

Use labels such as `lockfile:root`, `api:public-client`, `migration:accounts`, `db:test-a`, `port:4173`, `build:dist` and `hardware:usb-phone`. Identical labels serialize access. `*` is exclusive. The coordinator must discover hidden coupling; a path-based scheduler cannot prove semantic independence.

Examples of useful parallel work: component audits, test-gap reviews, dependency analysis, read-only security inspection, docs/code comparison, independent isolated defect fixes, and separate final reviews. Keep global interface/schema/lockfile changes single-owned.

## Parallel command checks

Commands are serial by default. Explicitly independent commands can declare `parallelSafe:true` and disjoint resource labels. They execute in bounded concurrent waves. An exclusive command is a sequencing barrier; later checks do not jump ahead of it. Do not label two tests independent when they share writable fixtures, databases, ports, generated source or package caches with unsafe mutation.

## Failures and resumption

A lease is a reservation, not proof of an active or completed worker. If dispatch fails, settle it as blocked with `infrastructure:true`. A dead provider or missing compiler should not consume coding-repair escalation attempts. On resume, reconcile active leases with native jobs; never silently expire an agent that might still be writing.

A task that fails two substantive repair attempts advances one tier. Two further failures advance again; two deep-tier failures block that task. New evidence can justify explicit reopening, but no infinite same-failure retry loop is installed.

## Evidence barriers

Parallel workers can inspect a stable snapshot while others operate in isolated copies. Their patch results must be reconciled after integration. All final command evidence is tied conservatively to the entire source snapshot. Re-run mandatory checks after integration; a green isolated branch is not proof the combined tree is green.

Only the parent changes `.far` through the tools. Workers return structured results. State uses exclusive lock files and atomic rename writes. These safeguards protect cooperative workflows and crashes, not malicious processes with the same filesystem privileges.
