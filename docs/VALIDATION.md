# Validation record — 2.1.0-rc.1

Validation date: **25 November 2026**. Environment: Linux x86_64, Node.js **24.22.3**, Bun **1.4.5**, Git **2.43.0**, OMP **19.1.1**.

## Results

| Validation surface | Result | Evidence and limits |
|---|---|---|
| Behavioral suite | **117 passed, 0 failed, 0 skipped** | `npm test`; temporary Git repositories, subprocesses and deterministic policy/recovery fixtures |
| Development package checks | **PASS** | Exact final commit `npm run check`; 60 tracked files discovered, 27 JavaScript files syntax-checked, source manifest integrity intentionally not required |
| Pack integrity | **PASS** | `python3 docs/overhaul/FAR-Overhaul-Pack-v2.0.0/scripts/verify-pack.py --root docs/overhaul/FAR-Overhaul-Pack-v2.0.0`; 56 files and 79/50 contract cases |
| Pinned source reproductions | **COLLECTED** | Three v1 gate gaps reproduced against d5bba12; safe behavior is covered by `tests/gates-regression.test.mjs` |
| M7/M8 local increment | **PASS** | `tests/learning.test.mjs` 3/3; full suite 120/120; M8 measurement has five alternating samples per side on a 1,000-file fixture; no TADA historical run available |
| Release artifact build/installer/rollback | **PASS** | Candidate `2.1.0-rc.1`; Bun-aware installer and release validation passed 14 checks; M7 migration/export tests passed; exact receipt and hashes are retained outside source |
| Live OMP extension/provider smoke | **PARTIAL / INHERITED** | Exact `2.1.0-rc.1` artifact startup smoke passed on OMP 19.1.1; provider smoke inherited from released core because M7 is local deterministic behavior |
| Bun and non-Linux behavior | **PARTIAL / WAIVED** | Bun 1.4.5 ran 120/120 tests and package smoke. User explicitly waived non-Linux qualification for this publication; non-Linux remains NOT_RUN |

The suite covers review precedence, latest applicable evidence, plan action coverage, dependency success, escalation policies, exact approvals, reservations, bounded stopping, reconciliation/fencing, pause/cancel/resume, schema migration, scope, deduplication and pagination. Mock extension tests remain host-contract evidence, not live-host qualification.

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
