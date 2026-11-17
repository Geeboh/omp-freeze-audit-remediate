# Review of prompt v4.0 and implementation decisions

This package implements a reviewed **v4.1 workflow policy**. The plugin's software version is independently **1.0.0**.

## What was retained

Feature Freeze -> Code Freeze -> Release Candidate; autonomous goal continuation; no user testing; whole declared repository scope; risk-based fixes; pragmatic DRY/KISS/SOLID/YAGNI; independent review; automated validation; conservative Git handling; cost-aware model delegation; durable resumption.

## What was corrected

| v4 risk | Implemented correction |
|---|---|
| Hard-coded model branding and an arbitrary 70/25/5 allocation | Native `@smol`, `@default`, `@slow` roles, actual runtime resolution, current-model mode and evidence-based escalation. No price/benchmark claims or quota of tasks per tier. |
| “Parallelize where possible” was only prose | DAG scheduler, ready waves, path/resource conflict checks, leases, concurrency bounds and retry tiers; native OMP executes the workers. |
| Endless remediation and growing acceptance requirements | Explicit modes, sealed project-specific checks, finite stage gates, two failed substantive attempts per tier and a blocked stop state. No invented universal external gates. |
| A report could be mistaken for a completed audit | Per-file review records tied to source content/type/executable mode; enumeration never creates review evidence. |
| Passing tests on old code could be reused | Whole-source/spec fingerprints and evidence-log hash checks. Source changes or changed/missing logs invalidate final evidence. |
| Model self-certification | Actual local command results plus separate-context review records. Review identity is explicitly an attestation, not cryptographic proof. |
| Conditional readiness could conceal a failed mandatory check | Mandatory failure or missing proof remains NOT_READY. Conditional readiness only permits documented nonblocking residuals after every required gate passes. |
| Removal of manual testing could create fabricated hardware confidence | No user testing at all; simulated/mocked results remain labelled, and real unavailable required checks remain unverified. |
| Nineteen overlapping live documents could create drift | One JSON ledger plus derived reports; source documentation remains separate and preserved. |
| Prompt text could pretend to run `/goal` | Direct documented session-mode API or explicit native CLI `--goal`; no slash-command simulation. Missing capabilities are reported, not silently bypassed. |
| Parallel writers could corrupt shared files or evidence | Parent-owned state, atomic writes, exclusive locks, coordinator integration, native isolated patches and shared-writer fallback. |
| Instrumentation could reduce parallel speed | Usage is observed at `turn_end`, not through `tool_result` interception, avoiding that documented speculative-launch restriction. |

## Deliberate boundaries

FAR is an OMP workflow extension, not a standalone coding model, process sandbox, production deployment service or cryptographic audit authority. It executes registered local checks itself. It does **not** execute a model when issuing a lease: the OMP coordinator calls native `task`, reviews outputs and integrates patches. This avoids undocumented model-spawn APIs and inherits the host's permissions, provider configuration and concurrency controls.

Native goal owns continuation. FAR does not maintain a second background auto-reply loop or resume after an explicit pause. A prompt cannot override host budgets, API failures or cancellation.

Git inventory is explicit: tracked plus nonignored untracked files; `.far` excluded; ignored caches not swept; external submodules are integration boundaries unless audited separately. No universal “all code everywhere” claim is made.

## Validation distinction

The package includes executable unit/integration fixtures and a mock host API contract harness. The live OMP binary/provider environment was unavailable in the build container. Consequently, the documentation/API review and local test results are not presented as a completed live OMP-host integration test.
