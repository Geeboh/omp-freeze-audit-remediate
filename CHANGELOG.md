# Changelog

## 2.0.0-rc.1 — 2026-11-24

Core overhaul candidate from the FAR overhaul pack.

- Correct authoritative review and check evidence precedence.
- Require plan action coverage and keep shelved or denied dependencies unresolved.
- Add scope, delta-base and profile options with conservative input manifests.
- Add `never`, `shelve`, `ask` and `always` envelope policy with trusted one-use approvals and transactional budgets.
- Add finite waves, progress records, fencing, idempotent results, pause/cancel/resume, schema-v1 migration and restore helpers.
- Add exact finding deduplication, structured pagination and staged release manifests.
- Separate read-only package checks from artifact manifest integrity.

Live OMP/provider execution remains a separate qualification surface.

## 1.0.0 — 2026-11-17

First executable package, implementing revised workflow policy v4.1 from the v4 master-prompt review.

- Public OMP extension manifest; `/far`; eight described/schema-validated tools; trigger-rich skill; seven bounded specialist agents.
- Five modes and explicit native goal/YOLO launcher with per-run concurrency/isolation settings.
- Parallel DAG scheduler, ownership/resource conflicts, leases, isolated-fix policy and finite escalation.
- Persistent coordinator-owned state; Git/content inventory; source coverage and boundary declarations.
- Explicit local command contract/runner, redacted bounded logs, deadlines/cancellation, content/spec/log integrity checks.
- Independent review attestations, mode-specific gates and non-misleading readiness decisions.
- Current-model/native-role routing, operator override preservation and observed usage metadata only.
- Tests, package checks, standalone installer, examples and compatibility/validation boundaries.

Live OMP/Bun/provider execution is not asserted; see the validation record.
