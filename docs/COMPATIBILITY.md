# Compatibility and primary sources

## Reviewed target and measured host boundary

The follow-through candidate is `2.1.0-rc.1`. It retains the released ESM adapter, five modes, eight tools and atomic JSON state while adding disabled-by-default local learning and measured M8 decisions.

Local validation used Node.js **24.22.3**, Bun **1.4.5**, Git **2.43.0**, OMP **19.1.1** and Linux x86_64. The installer now provisions Bun 1.4.5+ when absent. Bun ran all 117 tests successfully after the runtime-command normalization. The OMP executable and CLI help are available; extension load and provider smoke are qualified separately, while trusted approval origin, exact route enforcement and non-Linux behavior remain unqualified.

## Discovery contract

The package declares `omp.extensions:["./src/index.js"]`. Link the whole directory using `omp plugin link /absolute/path/to/package`, or load that directory with `omp --extension /absolute/path/to/package` for one session. Conventional `skills/` and `agents/` supply the workflow and specialist definitions. A new session loads installed extension modules. A file-only trusted-extension allowlist is not equivalent to package-root discovery.

`/far doctor` inspects registered tools, command visibility, native task/goal availability, mode-control API and model resolution without making a paid model call. Missing visibility is reported rather than equated to absence. An ordinary session receives the discoverable skill and essential `far` entry tool even before a workflow starts.

## Capability matrix

| Surface | Used interface | Missing capability behavior |
|---|---|---|
| Runtime registration | default factory; `registerTool`, `registerCommand`, `on`, injected `pi.zod` | Explicit initialization error, not a fake working plugin |
| Skill/agent discovery | Package-root conventional directories | Doctor/help points to expected names; no invented API registration |
| Native goal entry | `ctx.sessionModes.getState/set` in TUI | Explicit refusal; CLI `--goal` or intentionally bounded `--no-goal` alternative |
| Goal launcher | `--goal`, `--yolo`, `--no-prewalk`, `--config`, `--extension` | Host CLI error is surfaced; no undocumented fallback |
| Parallel workers | Native `task` batch schema; optional isolation | Inspect runtime schema; one shared writer if isolation unavailable |
| Models | `ctx.models.current/list/resolve`; `before_subagent_spawn` | Preserve operator routing; unresolved routes may use actual parent with a limitation note |
| Usage | Passive `turn_end` native task result metadata | Unavailable telemetry remains unavailable; no invented billing figures |
| Active hints | `before_agent_start` custom message; `ctx.ui.setStatus` | UI failure does not replace workflow result |
| Tool policy | `approval` read/write/exec, essential/discoverable metadata | Host policy remains authoritative |

The plugin deliberately avoids tool-call/tool-result middleware solely for telemetry: upstream documents that such middleware affects native speculative launching. No private imports, monkey patches, fake `/goal` message strings or resources-discover hooks are used.

## Primary upstream references

These sources describe the APIs the adapter targets; they do not prove this package was executed in an OMP host.

- [Extension authoring and manifest](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/skills/authoring-extensions.md)
- [Extension API, session modes and hooks](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md)
- [Public extension TypeScript definitions](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/extensibility/extensions/types.ts)
- [CLI flags and incompatibilities](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/cli-reference.md)
- [Plugin linking and discovery](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/plugin-manager-installer-plumbing.md)
- [Task batching, isolation and result metadata](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/tools/task.md)
- [Agent definitions and model precedence](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/task-agent-discovery.md)
- [Skill discovery](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/skills.md)
- [Version observed at retrieval](https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/package.json)

No actual capability, pricing or benchmark claims about named GPT-6 model tiers were established by these OMP sources. Native role mapping is a configuration policy, not an empirical ranking.
