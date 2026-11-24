# FAR core release candidate

This document records the implemented M0-M5 contract for FAR `2.0.0-rc.1`.

## Implemented behavior

- The state store uses schema 2 with atomic JSON writes, v1 migration, dry-run migration, checkpoints, and restore helpers.
- Final review gates keep unresolved `changes_required` decisions blocking until an explicit supersession is recorded.
- Finding verification uses the latest applicable check result for the same context. A newer failure cannot be hidden by an older pass.
- Plan mode requires an action or permitted disposition for each actionable finding. A clean plan can contain zero remediation tasks.
- Tasks use outcome-aware dependencies. Shelved, denied, deferred, failed, and cancelled prerequisites do not satisfy ordinary result edges.
- Stage admission rejects discretionary work at code freeze and release candidate stages.
- Finding fingerprints deduplicate exact observations while preserving aliases.
- Lists accept stable cursors and return structured pages. Display truncation does not remove machine-readable tool results.
- New runs default to escalation policy `shelve`. `never`, `shelve`, `ask`, and `always` share one execution envelope and fixed-point budget path.
- Trusted approvals bind an immutable proposal digest, scope, policy revision, expiry, and one-use grant. Unknown host enforcement shelves upgrades.
- Waves record finite membership, fencing tokens, dispatch identity, replay-safe results, convergence counters, and no-progress stops.
- Scope, delta base, and quick, balanced, or release profiles are recorded in the run.
- Release builds use tracked allowlists and external staging. Builders do not rewrite source manifests or overwrite existing artifacts.

## Qualification boundary

The deterministic Node suite, package checks, migration tests, installed archive checks, and CLI checks qualify local behavior. The current host probe observed OMP `19.1.1`, Node `24.22.3`, Git `2.43.0`, and no Bun executable. A real installed OMP extension session, native worker dispatch, trusted host approval, and provider execution remain separate qualification records until run on that host.

## Follow-up work outside M0-M5

- M7. Add bounded, provenance-bearing local lessons and a versioned optional export. Lessons must never change policy or approval decisions.
- M8. Benchmark source hashing, ledger growth, pagination, and concurrency on pinned workloads. Change storage or add a UI only when measurements show a maintained bottleneck.

Neither follow-up is part of this core release candidate or its readiness gate.
