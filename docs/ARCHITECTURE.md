# Architecture

## Control and execution

The parent OMP model reads the discovered skill and owns the workflow. `/far` or the standalone launcher starts native goal mode. The extension supplies local state tools and event integration; native `task` owns model execution. There is no embedded provider client, alternate model loop, cron job or hidden service.

```text
package manifest + skill + agents
             |
/far or CLI launch -> native goal coordinator
             |
        FAR local tools -> .far/state.json
             |
      DAG/lease scheduler -> native task workers
             |                       |
      serial integration <--- evidence / patches
             |
      real command runner -> hashed logs
             |
      gates + separate review -> completion / blockers
```

## Modules

| Module | Responsibility |
|---|---|
| `src/index.js` | Public OMP registration, commands, model hooks, discovery hints and passive usage observation |
| `src/schemas.mjs` | Eight injected-schema tool definitions/descriptions |
| `src/actions.mjs` | Shared tool/CLI dispatch and approval classification |
| `src/engine.mjs` | State transactions, findings, contracts, stage transitions and reports |
| `src/io.mjs` | Git scope, content hashing, safe relative paths, exclusive locks, atomic writes and redaction |
| `src/scheduler.mjs` | Task graph, path/resource conflicts, leases and finite escalation |
| `src/runner.mjs` | Actual argv processes, deadlines/cancellation, output caps and evidence |
| `src/gates.mjs` | Mode-specific criteria, freshness and release qualification |
| `src/workflow.mjs` | Help, command parser, generated objective and bounded active context |
| `bin/far.mjs` | Standalone engine actions and explicit native-goal launcher |

## Persistence

`.far/state.json` is the authoritative versioned ledger. Source snapshots are derived from tracked/nonignored Git paths, content, entry type and executable bit, excluding FAR's own storage. `.far/evidence` holds bounded redacted command logs. `.far/reports` is regenerated without duplicating authoritative editable registers across dozens of files.

A short exclusive lock protects each read-modify-write transaction. File replacement is atomic. Command execution happens outside that lock, with a persisted batch reservation. Live locks are not stolen. Stale recovery checks same-host process liveness; an inaccessible remote process is not presumed dead. Workers return results rather than editing the shared ledger.

## Trust and evidence

Code/command output is data, not an instruction to override the host. The extension still runs in the OMP process and is not a security sandbox. A malicious same-user process could rewrite local state. Hashes detect ordinary source/spec/log drift; they do not authenticate an adversary-controlled environment.

Source reviews and independent review records are explicit attestations. Actual exit status and logs come from the runner. Neither an agent's claim nor a green shell exit proves meaningful tests were selected. The skill requires investigation of test discovery, assertions and integration scope. Unavailable genuine checks stay visible; artificial external signing/user-QA gates are not invented.

## Progress and termination

Each successful task/check/review produces reusable state; subsequent sessions read it rather than starting over. Audit/plan have finite deliverables. Full mode moves from feature-freeze to code-freeze to release-candidate, limiting discretionary changes after freeze. Final evidence is checked on the integrated tree. The parent invokes `far_gate.finish` before native goal completion. The extension does not monkey-patch or falsely claim to intercept native goal completion.

Repeated substantive failures escalate with a bound. Infrastructure failures block without escalation. When every useful task is blocked, record the actual cause, produce the report and stop/pause the native goal using its available supported interface. No self-resubmitting loop overrides host stops, cost ceilings or user interrupts.
