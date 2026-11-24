# Validation record — 2.0.0-rc.1

Validation date: **25 November 2026**. Environment: Linux x86_64, Node.js **24.22.3**, Git **2.43.0**, OMP **19.1.1**. Bun is absent.

## Results

| Validation surface | Result | Evidence and limits |
|---|---|---|
| Behavioral suite | **117 passed, 0 failed, 0 skipped** | `npm test`; temporary Git repositories, subprocesses and deterministic policy/recovery fixtures |
| Development package checks | **PASS** | `npm run check`; 115 files discovered, 28 JavaScript files syntax-checked, source manifest integrity intentionally not required |
| Pack integrity | **PASS** | `python3 docs/overhaul/FAR-Overhaul-Pack-v2.0.0/scripts/verify-pack.py --root docs/overhaul/FAR-Overhaul-Pack-v2.0.0`; 56 files and 79/50 contract cases |
| Pinned source reproductions | **COLLECTED** | Three v1 gate gaps reproduced against d5bba12; safe behavior is covered by `tests/gates-regression.test.mjs` |
| Release artifact build/installer/rollback | **PASS** | Clean committed candidate built `2.0.0-rc.1`; ZIP and installer validation passed 13 checks; migration restore passed separately; exact receipt and hashes are retained outside source |
| Live OMP extension load/native task/approval/provider | **NOT_RUN** | OMP 19.1.1 is installed; this worktree has not been linked into a fresh host session |
| Bun and non-Linux behavior | **NOT_RUN** | Bun absent; Linux only |

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
node scripts/validate-release.mjs /tmp/far-release-output/omp-freeze-audit-remediate-2.0.0-rc.1-install.mjs
```

These are package-maintainer automated checks, not a mandatory end-user testing gate. Live host prerequisites remain documented in [Compatibility](COMPATIBILITY.md).
