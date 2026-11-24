# OMP Freeze Audit Remediate

**Release candidate 2.0.0-rc.2 · workflow policy v5 · parallel-first · no user testing**

An executable Oh My Pi extension for feature freeze, repository-wide audit, bug remediation, pragmatic DRY/KISS cleanup and automated release qualification. It combines a discoverable skill, seven specialist agent definitions, eight model-callable tools, a slash command, a durable local ledger, a conflict-aware scheduler and a real command/evidence runner.

**Validation boundary:** the Node engine, real Git/process operations, installer and mocked extension API are tested locally. The public OMP API was checked against upstream documentation advertising 18.22.0 on 17 November 2026. A real OMP/Bun/provider session was not available here; live host loading, agent discovery and model execution are not claimed as tested. See [compatibility](docs/COMPATIBILITY.md) and [validation](docs/VALIDATION.md).

## Install once

Requires an existing OMP installation, Node.js 22+, Bun 1.4.5+ and Git. The generated installer installs Bun when missing. Model calls still need your working OMP provider configuration.

From the directory containing the distributed single-file installer:

```bash
node ./omp-freeze-audit-remediate-2.0.0-rc.2-install.mjs \
  "$HOME/.local/share/omp-freeze-audit-remediate-2.0.0-rc.2"
omp plugin link "$HOME/.local/share/omp-freeze-audit-remediate-2.0.0-rc.2"
```

The installer verifies embedded files, installs or reuses Bun 1.4.5+, refuses an existing destination, and does not change OMP configuration. Missing-Bun installation needs network access and Linux/macOS `unzip`. `omp plugin link` is the explicit separate registration step. Keep the installed directory in place. Start a **new OMP session** to load it.
The release builder uses `package.json` identity and a tracked allowlist. It writes manifests and receipts only to the output directory. Development checks do not require the source manifest to be current.

Alternatively extract the ZIP outside the repository being audited and link its `omp-freeze-audit-remediate-2.0.0-rc.2` directory. Do not copy only `src/index.js`: the package root contains the agents and skill needed for discovery.

## Recommended full run

From an interactive terminal:

```bash
node "$HOME/.local/share/omp-freeze-audit-remediate-1.0.0/bin/far.mjs" \
  launch full --root /path/to/project --parallel 4 --models auto
```

This opens a fresh native OMP goal with YOLO and prewalk disabled, loads the whole package, and supplies a temporary per-run overlay. The overlay enables goal mode, native task batching and isolated workers; it sets native concurrency to the requested number and leaves isolated patches **unapplied** for coordinated integration. It never edits your global or project OMP settings. Host permissions, budgets and provider limits still apply. Run interactively, not through a pipe.

`--parallel 8` allows up to eight nonconflicting jobs; it does not force eight jobs when resources, dependencies or the host prevent it. `--models current` keeps FAR workers on the active parent model. `--dry-run` prints the intended launch without starting OMP or creating workflow state. `--no-overlay` respects an already-configured host without adding the recommended session settings.

### Inside an existing OMP session

After linking, start with the supplied static four-worker overlay:

```bash
cd /path/to/project
omp --config "$HOME/.local/share/omp-freeze-audit-remediate-1.0.0/configs/parallel-safe.yml" --no-prewalk --yolo
```

Then:

```text
/far full --parallel 4 --models auto
```

The command enters native goal mode directly and sends the workflow objective. No second `/goal` command, `/vibe` wrapper or pasted master prompt is needed. It does not enable YOLO inside an existing session: choose that at launch. It refuses to overwrite an unrelated goal or pretend that a missing goal API started an until-complete run.

## Modes

| Command | Purpose | Product code edits |
|---|---|---|
| `/far audit` | Parallel inventory/review and defect register | No |
| `/far plan` | Audit plus a dependency-ordered implementation plan and verification contract | No |
| `/far remediate` | Work through the register and verify fixes | Yes |
| `/far verify` | Automated checks and independent assessment of current code | No |
| `/far full` | Feature freeze → audit/fix → code freeze → release candidate | Yes |

Useful controls:

```text
/far help
/far status
/far models
/far doctor
/far report
/far pause
/far cancel
/far migrate
/far resume
```

The CLI launcher accepts the same five modes. Mode changes retain earlier evidence, findings and event history. `/far resume` resumes the current ledger rather than inventing a new audit. Read-only modes are workflow constraints, not an OS sandbox: executed tests may write caches and temporary files.

## How OMP discovers and uses it

`package.json#omp.extensions` declares the extension. Conventional `skills/freeze-audit-remediate/SKILL.md` advertises trigger phrases and loads the full workflow only when needed. Seven conventional `agents/*.md` definitions advertise bounded specialists and autoload that skill. The extension registers eight described, schema-validated tools, with `far` marked essential. It also registers `/far` help/completion, displays a session notice/status line and supplies concise active-workflow context without replacing the host system prompt.

The parent reads the skill, owns shared state and dispatches native `task` workers. Workers are told to return their bounded evidence, never recursively start a whole freeze or write the shared ledger. The adapter rejects subagent attempts to mutate its ledger tools.

## Tool surface

| Tool | Responsibility |
|---|---|
| `far` | Start/resume, mode/options, status, doctor, reports and safe branch preparation |
| `far_inventory` | Hashed repository scope, source-review attestations and external boundaries |
| `far_findings` | Severity, evidence, fix/disposition history and verification links |
| `far_tasks` | Dependencies, resource ownership, parallel waves, leases and bounded escalation |
| `far_checks` | Explicit local commands, sealed contract, actual execution and log evidence |
| `far_review` | Separate-reviewer results tied to the current content snapshot |
| `far_gate` | Phase transitions, readiness checks and mode-specific completion |
| `far_models` | Actual host model-role resolution and auto/current routing |

The detailed schemas and call examples are in [Tools](docs/TOOLS.md). The tools manage real state and processes; they do not themselves contain a model or fix code without OMP. The native task system performs model work; the plugin schedules and verifies the workflow around it.

## Parallel execution

Independent audits and reviews run concurrently. Editing tasks run concurrently only with confirmed native isolation and nonconflicting scopes/resources. Without isolation, the scheduler permits one shared writer, while compatible read-only work can continue. Dependencies, exact path prefixes, shared ports/databases/lockfiles and active leases constrain each wave. The coordinator inspects and integrates patches serially, then checks the integrated tree.

Validation commands run concurrently only when explicitly declared parallel-safe with independent resources. Otherwise they serialize. A serial check also forms an ordering barrier. Claiming a task is not spawning a worker; a successful worker exit is not proof its patch is correct.

## Model policy

Auto mode uses actual configured OMP roles: `@smol` for routine work, `@default` for complex work and `@slow` for consequential work. Agent overrides remain supported. Configure these roles to your available Luna/Sol/Astra choices or other models using OMP's supported settings; the package does not guess provider IDs or change your parent model.
Escalation uses `never`, `shelve`, `ask` and `always`. New runs default to `shelve`. One approved execution envelope covers route, effort, fallback, coordinator, reviewers and extra workers. Exact proposals require trusted approval; the real OMP host must expose tested enforcement or FAR shelves the upgrade.

Budgets use transactional integer reservations. Unknown monetary usage is not zero. Shelved or denied blockers remain unresolved. Final release checks run on the integrated candidate and staged artifact bytes.

Two substantive failed attempts escalate a task; infrastructure failures block rather than burn repair attempts. After bounded deep-tier failures, stop that task pending new evidence. No fixed workload percentages, automatic spending promises or assumed model capability rankings are used. Actual observed native worker metadata is recorded when available; unavailable usage/cost information stays unavailable.

## Evidence, completion and safety

Project state is in `.far/state.json`; command logs in `.far/evidence/`; derived reports in `.far/reports/`. Source inventory is Git-tracked plus nonignored untracked files, excluding `.far`. Submodule internals, ignored assets and real hardware are not silently claimed as audited.

PASS requires actual command execution, matching source/spec hashes and intact logs. A changed source snapshot invalidates previous final evidence. Review records are agent attestations, not authenticated identities. Arbitrary commands can return zero without meaningful assertions, so the skill requires test-discovery and assertion review. The engine cannot prove semantic correctness by exit code alone.

Audit/plan completion means the requested audit/plan is complete; release readiness remains `NOT_ASSESSED`. Full/remediation/verification gates produce `READY`, `CONDITIONALLY_READY` only with all mandatory checks passing plus nonblocking deferrals, or `NOT_READY`. Mandatory failures/unverified checks never become conditional passes. No user testing, manual acceptance or arbitrary external QA recipient is required. Genuine unavailable required checks still limit readiness.

No automatic publishing, production deployment, destructive database operations, history rewriting, blanket staging or disposal of user changes. YOLO is permission to continue ordinary local engineering, not permission to bypass the host or risk unrelated systems. Stop/pause requests and hard budgets remain authoritative. No tool can guarantee discovery of every possible defect or uninterrupted completion despite external failures.

## Documentation and development

- [Modes and continuation](docs/MODES.md)
- [Tool reference](docs/TOOLS.md)
- [Copy/paste examples](docs/EXAMPLES.md)
- [Parallel scheduling and integration](docs/PARALLEL.md)
- [Review of the v4 prompt](docs/REVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety and limitations](docs/SAFETY.md)
- [Compatibility and primary sources](docs/COMPATIBILITY.md)
- [Validation record](docs/VALIDATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

No dependency installation is needed to run the supplied tests:

```bash
cd /path/to/omp-freeze-audit-remediate-1.0.0
npm test
npm run check
```

The tests use temporary repositories and fixtures, not a paid provider. Release candidate `2.0.0-rc.2` uses state schema 2, policy schema 2 and Node.js 22+. Live OMP route enforcement, provider calls, Bun and non-Linux behavior remain unclaimed unless separately qualified.
