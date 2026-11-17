# Safety, evidence and limits

## Boundaries

YOLO is native OMP approval behavior, not unlimited authorization. FAR does not disable host/provider policies. No production deployment, release publication, protected-branch merge, force push, destructive reset, automatic stash or commit of preexisting user work is authorized by this workflow.

The plugin executes local commands supplied through its check tool using argument arrays and `shell:false`. This prevents implicit shell expansion; it does **not** make arbitrary scripts safe. An interpreter can execute arbitrary code. Review commands and project dependencies before registering/running them. Use isolated development environments for untrusted repositories. The plugin is loaded into the OMP host process and is not sandboxed.

Commands should be finite, non-daemonizing and self-cleaning. Timeouts/abort terminate the process group on POSIX; deliberately detached daemons or external services may survive. Windows process-tree cleanup is not equivalent to POSIX process-group cleanup and was not tested here.

## User work and source scope

FAR records Git HEAD/branch and preexisting changes before work, excluding its own local state. Its branch helper refuses a dirty tree instead of hiding changes in a stash or silently basing an audit on committed files alone. The agent must preserve mixed user edits and stage only explicit owned changes.

Inventory uses Git tracked/nonignored untracked paths. Ignored code is outside that default scope; discover relevant omitted code during architecture review and document it rather than claiming it was covered. Submodules are external-tree entries with separate integration-only boundary records. To audit submodule internals, run a separate FAR workflow in that Git repository and reference its evidence.

Symlink targets are not traversed. Managed state/log paths reject symlinks and traversal. Source snapshots include content, type and executable bit. State is stored under `.far` using restrictive creation modes, exclusive locks and atomic writes. These are cooperative safety measures, not a defense against an attacker sharing the process account or exploiting filesystem races.

## Verification semantics

Command evidence contains executable/argv, relative cwd, timestamps, exit status, timeout/cancellation state, bounded log location/hash, source/spec hashes and selected runtime metadata. PASS means the command exited zero on an unchanged snapshot; it does not prove meaningful test discovery/assertions. The agent/reviewer must reject placeholder or zero-test validation.

Gates rehash evidence logs. Missing/changed logs and changed source/spec hashes cannot support final readiness. Whole-tree fingerprints are conservative: unrelated source changes can require re-running a check. Secret environment values, remote service state, dependency installation contents and all possible runtime conditions are not fully captured, so this is not hermetic reproducibility proof.

Reviews are stored as `agent-review-attestation`. Actor IDs and transcript references are recorded; FAR does not cryptographically authenticate them or require a new external trusted-worker system. Separate reviewers can still make correlated mistakes. No test suite or LLM review proves zero defects.

## No user testing

User acceptance testing is out of scope, not silently “passed.” The workflow creates no mandatory manual checklist or screenshot task. Missing real hardware/external-service validation remains labelled. A required missing check blocks release; an out-of-scope/nonblocking limitation is documented without inventing a new user-testing gate.

The plugin does not convert subjective usability assessment into an automated fact. Headless UI tests verify observable assertions, not every human interaction.

## Secrets and logging

Command output is capped at 1 MiB per check and common token/password/private-key patterns are redacted. This is best-effort, not exhaustive sanitization. Avoid secrets in command arguments, source evidence, review text and test output. `.far` can contain sensitive paths and diagnostics. Do not publish it wholesale; review any exported report before sharing. Add `.far/` to the appropriate ignore policy explicitly when suitable; FAR does not rewrite `.gitignore` automatically.

## Budgets and stop controls

The plugin never resets OMP cost/token limits, ignores cancellation, or schedules a second autonomous retry loop. Native goal continuation operates only while the host/session remains running and authorized. Failed required gates cannot be waived by `finish`. Legitimate verification-contract changes require recorded rationale and resealing; they are not forbidden forever, nor are they a license to delete failing tests.

## Runtime environment and freshness limits

Child commands inherit the authorized project environment except `NODE_TEST_CONTEXT`, a parent Node test-runner marker that can cause nested test discovery to be skipped. The runner supplies `CI=1` only when CI is unset and records selected actual environment values. It does not remove intentional `NODE_OPTIONS` or read secrets into reports.

Source/spec/log freshness does not detect every change in ignored dependencies, external services, tool binaries or hardware state. Re-run relevant checks after those changes. A local hash is neither proof of an authentic execution environment nor a substitute for meaningful assertions.
