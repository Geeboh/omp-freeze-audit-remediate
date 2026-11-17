# Validation record — 1.0.0

Validation date: **17 November 2026**. Environment: Linux x86_64, Node.js **22.16.0**, Git **2.47.3**. No runtime npm dependencies were installed.

## Results

| Validation surface | Result | Evidence and limits |
|---|---|---|
| Core/adapter/CLI unit and integration suite | **96 passed, 0 failed, 0 skipped** | `node --test tests/*.test.mjs`; actual temporary Git repositories and child processes, plus an explicitly mocked OMP API |
| Offline installer checks | **12 passed, 0 failed** | Extraction, hashes, installed imports/CLI, package metadata/syntax/links, overwrite preservation, path/symlink protection and corrupted payload rejection |
| Package consistency | **PASS** | Manifest entry, one skill, seven agents, eight tool schemas, local Markdown links, JavaScript syntax and generated integrity manifest |
| Regression demonstration | **PASS** | Actual failing Node assertion on a deliberately broken arithmetic fixture, deterministic source correction, passing assertion, fresh evidence and completed gates |
| Cross-process coordination | **PASS** | Concurrent CLI writers preserve distinct records; task claims and state locks tested |
| Native OMP host loading / Bun runtime | **NOT RUN** | Neither executable was available in the build environment |
| Real model calls / role routing / agent discovery | **NOT RUN** | Contract-shaped mock and upstream API inspection only; no provider credentials/calls |
| Real target-project remediation | **NOT RUN** | No target project source was supplied for this package build |
| Windows/macOS behavior | **NOT RUN** | Linux validation only; POSIX process-group cleanup differs from Windows |

The deliberate fixture edit is test code, not evidence that a live AI agent remediated a repository. Separate-review records in fixtures are labelled fixtures. No usability, hardware or user acceptance testing is claimed or required by the workflow.

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
node scripts/validate-release.mjs /tmp/far-release-output/omp-freeze-audit-remediate-1.0.0-install.mjs
```

These are package-maintainer automated checks, not a mandatory end-user testing gate. Live host prerequisites remain documented in [Compatibility](COMPATIBILITY.md).
