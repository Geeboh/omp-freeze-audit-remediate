# Validation record — 2.1.0-rc.1

Validation date: **25 November 2026**. Environment: Linux x86_64, Node.js **24.22.3**, Bun **1.4.5**, Git **2.43.0**, OMP **19.1.1**.

## Results

| Validation surface | Result | Evidence and limits |
|---|---|---|
| Behavioral suite | **122 passed, 0 failed, 0 skipped** | `npm test`; temporary Git repositories and deterministic policy/recovery fixtures |
| Development package checks | **PASS** | M7/M8 candidate `npm run check`; 66 tracked files discovered, 30 JavaScript files syntax-checked, source manifest integrity intentionally not required |
| Pack integrity | **PASS** | `python3 docs/overhaul/FAR-Overhaul-Pack-v2.0.0/scripts/verify-pack.py --root docs/overhaul/FAR-Overhaul-Pack-v2.0.0`; 56 files and 79/50 contract cases |
| Pinned source reproductions | **COLLECTED** | Three v1 gate gaps reproduced against d5bba12; safe behavior is covered by `tests/gates-regression.test.mjs` |
| M7/M8 local increment | **PASS** | `tests/learning.test.mjs` 4/4; full suite 122/122; M8 five-sample measurements recorded at 1,000 and 10,000 files; historical TADA run explicitly waived |
| Release artifact build/installer/rollback | **PASS** | Candidate `2.1.0-rc.1`; Bun-aware installer and release validation passed 14 checks; M7 migration/export tests passed; exact receipt and hashes are retained outside source |
| Live OMP extension/provider smoke | **PARTIAL / INHERITED** | Core provider smoke is inherited; capability report now names exact-route enforcement and trusted approval origin as unsupported or unavailable instead of claiming control |
| Bun and non-Linux behavior | **PARTIAL / WAIVED** | Bun 1.4.5 ran 122/122 tests and package smoke. User explicitly waived non-Linux qualification; non-Linux remains NOT_RUN |

The suite covers review precedence, latest applicable evidence, plan action coverage, dependency success, escalation policies, exact approvals, reservations, bounded stopping, reconciliation/fencing, pause/cancel/resume, schema migration, scope, deduplication and pagination. Mock extension tests remain host-contract evidence, not live-host qualification.
## Waivers

| Requirement | Status | Owner | Scope and rationale | Follow-up |
|---|---|---|---|---|
| Historical TADA run | **WAIVED** | User-authorized release decision | M7/M8 local increment only. No historical TADA ledger/logs are available, so no historical TADA result is claimed. | Run the bounded M6 staging pilot when an actual ledger, source baseline and authorized environment are available. |

## Important checks exercised

The suite covers source drift/executable bits, symlinks and traversal, dirty Git preservation, concurrent state writes, dependency cycles, overlapping edit scopes, resource conflicts, native-isolation fallback, stale leases, bounded model-tier escalation, timeouts/cancellation, log caps/redaction, changed or missing evidence files, contract revision, false completion, model-route reporting and failed goal startup.

A regression fixture exposed an inherited `NODE_TEST_CONTEXT` issue: a nested Node test command could skip its files while returning zero. The command runner now removes that parent-only marker, and the regression test requires both the real failing and corrected passing outcomes. This does not make arbitrary exit-zero commands equivalent to meaningful tests.

Mock extension tests check eight registrations, essential/discoverable metadata, slash command behavior, direct session-mode handoff, failed handoff cleanup, model-selection hooks, subagent ledger-write rejection and passive observed usage. They do not certify a specific installed OMP version.

## Reproduction

```bash
npm test
npm run check
```
The release builder additionally uses Python 3's standard library:

```bash
python3 scripts/build-release.py /tmp/far-release-output
node scripts/validate-release.mjs /tmp/far-release-output/omp-freeze-audit-remediate-2.1.0-rc.1-install.mjs
```

These are package-maintainer automated checks, not a mandatory end-user testing gate. Live host prerequisites remain documented in [Compatibility](COMPATIBILITY.md).
