/** OMP public extension adapter. No private OMP imports and no third-party runtime dependencies. */
import { FarEngine } from './engine.mjs';
import { definitions } from './schemas.mjs';
import { invoke, permission } from './actions.mjs';
import { HELP, ACTIVE_CONTEXT, objective, parseCommand } from './workflow.mjs';
import { MODES } from './gates.mjs';
import { now, requireThat, hash } from './io.mjs';
export const FAR_AGENTS = ['far-auditor', 'far-fixer', 'far-investigator', 'far-complex-fixer', 'far-reviewer', 'far-deep-fixer', 'far-deep-reviewer'];
function modelIdentity(m) { return m?.provider && m?.id ? `${m.provider}/${m.id}` : null; }
function serializable(v) { try { return JSON.parse(JSON.stringify(v)); } catch { return null; } }
function result(data, isError = false) {
  let body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const truncated = body.length > 22000;
  if (truncated) body = body.slice(0, 22000) + '\n[DISPLAY TRUNCATED. Complete ledger/evidence remain in .far; read targeted ranges. Not all records are shown.]';
  return { content: [{ type: 'text', text: body }], details: { truncated, value: truncated ? null : data }, ...(isError ? { isError: true } : {}) };
}
export async function modelsStatus(ctx, engine) {
  const roleModels = {};
  for (const [tier, role] of Object.entries({ economy: '@smol', standard: '@default', deep: '@slow' })) {
    let m; try { m = await ctx.models?.resolve?.(role); } catch { /* diagnostic only */ }
    roleModels[tier] = { role, resolved: modelIdentity(m), available: !!m };
  }
  const state = await engine.state(false);
  return { mode: state?.options.modelMode ?? 'auto', current: modelIdentity(await ctx.models?.current?.() ?? ctx.model), roles: roleModels, policy: state?.options.policy ?? null, budget: state?.budget ?? null, hostEnforcement: false,
    registryAvailable: typeof ctx.models?.resolve === 'function', note: 'Role names are your configuration; no benchmark ranking or price claim. Native operator overrides take precedence in auto mode. Actual execution is recorded only when native task metadata is observed. Escalation upgrades remain shelved unless the host exposes tested exact-route enforcement.' };
}
export async function hostDoctor(pi, ctx, engine) {
  const tools = typeof pi.getAllTools === 'function' ? pi.getAllTools() : [];
  const commands = typeof pi.getCommands === 'function' ? pi.getCommands() : [];
  return { ...await engine.doctor(), host: {
    runtime: ctx.mode ?? 'unknown', agentIdentity: ctx.agent?.kind ?? 'unavailable',
    registeredFarTools: tools.filter(t => t.name === 'far' || t.name.startsWith('far_')).map(t => t.name),
    nativeTaskRegistered: tools.some(t => t.name === 'task'), nativeGoalRegistered: tools.some(t => t.name === 'goal'),
    goalModeControl: typeof ctx.sessionModes?.set === 'function', modelRegistry: typeof ctx.models?.resolve === 'function',
    farCommand: commands.some(c => c.name === 'far'),
    skillCommandObserved: commands.some(c => c.name?.includes('freeze-audit-remediate')),
    instruction: 'The skill is advertised through conventional skills discovery. Inspect native task schema for batch/isolation support; missing registry visibility is UNKNOWN, not proof of absence. This diagnostic does not perform a paid model call.' }, models: await modelsStatus(ctx, engine) };
}
export default function freezeAuditRemediate(pi) {
  requireThat(pi && typeof pi.registerTool === 'function' && typeof pi.registerCommand === 'function' && typeof pi.on === 'function' && pi.zod, 'FAR requires OMP extension registration and injected pi.zod. See docs/COMPATIBILITY.md.');
  pi.setLabel?.('Freeze Audit Remediate');
  const seenUsage = new Set();
  async function engineFor(ctx) { return FarEngine.open(ctx.cwd); }
  async function progress(ctx, engine) {
    if (ctx.agent?.kind === 'sub') return;
    try {
      const s = await engine.status();
      if (s.initialized === false) return;
      ctx.ui?.setStatus?.('far', `FAR ${s.mode}/${s.stage} ${s.status} | reviewed ${s.coverage.reviewed}/${s.coverage.total} | tasks ${s.tasks.done} done/${s.tasks.running} running/${s.tasks.blocked} blocked`);
    } catch { /* Never replace the tool result with a UI-only error. */ }
  }
  for (const def of definitions(pi.zod)) {
    pi.registerTool({ ...def, hidden: false, defaultInactive: false,
      approval: args => permission(def.name, args),
      async execute(_id, params, signal, _onUpdate, ctx) {
        try {
          if (def.name === 'far' && params.action === 'help') return result(HELP);
          requireThat(!(ctx.agent?.kind === 'sub' && permission(def.name, params) !== 'read'), 'Only the parent coordinator may mutate FAR state. Return evidence to the parent.', 'COORDINATOR_ONLY');
          const engine = await engineFor(ctx);
          let data;
          if (def.name === 'far' && params.action === 'doctor') data = await hostDoctor(pi, ctx, engine);
          else if (def.name === 'far_models' && params.action === 'status') data = await modelsStatus(ctx, engine);
          else data = await invoke(engine, def.name, params, { signal });
          await progress(ctx, engine);
          return result(data);
        } catch (e) { return result({ error: e.message, code: e.code ?? 'FAR_ERROR', instruction: 'Correct the actual prerequisite. Do not fabricate a passing result or silently edit the ledger.' }, true); }
      },
    });
  }
  const show = (text) => pi.sendMessage({ customType: 'far-output', content: text, display: true, attribution: 'agent' }, { triggerTurn: false });
  pi.registerCommand('far', {
    description: 'Feature freeze, bounded parallel audit/remediation and automated verification. /far help; five modes; --parallel N --models auto|current --profile PROFILE --scope path[,path] --since REV --escalation MODE.',
    getArgumentCompletions: prefix => ['full', 'audit', 'plan', 'remediate', 'verify', 'resume', 'status', 'doctor', 'report', 'models', 'pause', 'cancel', 'migrate', 'learning', 'help'].filter(x => x.startsWith(prefix.trim())).map(value => ({ value, label: value })),
    handler: async (args, ctx) => {
      try {
        const { command, opts } = parseCommand(args);
        if (command === 'help') { show(HELP); return; }
        requireThat(ctx.agent?.kind !== 'sub', '/far commands run in the coordinator session');
        const engine = await engineFor(ctx);
        if (['status', 'doctor', 'report', 'models'].includes(command)) {
          const data = command === 'doctor' ? await hostDoctor(pi, ctx, engine) : command === 'models' ? await modelsStatus(ctx, engine) : await engine[command]();
          show(JSON.stringify(data, null, 2)); await progress(ctx, engine); return;
        }
        if (command === 'pause') {
          if (ctx.sessionModes?.getState?.().goal?.objective?.startsWith('[FAR]')) {
            const paused = await ctx.sessionModes.set({ mode: 'goal', action: 'pause' });
            requireThat(paused.ok, paused.message ?? 'Native goal could not be paused; interrupt the active turn first');
          }
          await engine.control('pause'); await progress(ctx, engine); show('FAR paused. No automatic reactivation; /far resume continues.'); return;
        }
        if (command === 'cancel') {
          await engine.control('cancel', 'Explicit /far cancel command'); await progress(ctx, engine); show('FAR cancelled. Running workers remain subject to reconciliation.'); return;
        }
        if (command === 'migrate') {
          const data = await engine.migration('inspect'); show(JSON.stringify(data, null, 2)); return;
        }
        if (command === 'learning') {
          const data = await engine.learning('status'); show(JSON.stringify(data, null, 2)); return;
        }
        requireThat(MODES.includes(command) || command === 'resume', 'Unknown /far command. Use /far help.');
        requireThat(typeof ctx.isIdle !== 'function' || ctx.isIdle(), 'Interrupt/wait for the current turn before starting a separate FAR workflow');
        let s = await engine.state(false);
        const mode = command === 'resume' ? s?.mode : command;
        requireThat(mode, 'No FAR run exists to resume');
        const settings = { parallel: opts.parallel ?? s?.options.parallel ?? 4, modelMode: opts.modelMode ?? s?.options.modelMode ?? 'auto', profile: opts.profile ?? s?.options.profile ?? 'balanced', scope: opts.scope ?? s?.options.scope, escalationMode: opts.escalationMode ?? s?.options.policy?.escalation?.mode ?? 'shelve' };
        // Do not steal another goal, or silently fall back to a one-turn run.
        let goalRequest;
        if (opts.goal) {
          requireThat(ctx.sessionModes?.set && ctx.sessionModes?.getState, 'Goal-mode API unavailable. Use the packaged CLI launch command or documented --goal fallback; --no-goal explicitly selects one ordinary turn.', 'HOST_CAPABILITY');
          const modes = ctx.sessionModes.getState();
          requireThat(modes.goal.status === 'inactive' || modes.goal.objective?.startsWith('[FAR]'), 'A different native goal is active. FAR will not replace it.', 'GOAL_CONFLICT');
          goalRequest = modes.goal.status === 'paused' ? { mode: 'goal', action: 'resume' } : { mode: 'goal', action: 'enter', objective: objective(mode, settings) };
        }
        if (!s) await engine.start({ mode, ...settings });
        else {
          if (s.mode !== mode) await engine.changeMode(mode, `Explicit /far ${mode} command`);
          else await engine.control('resume');
          await engine.configure(settings);
        }
        if (goalRequest) {
          const entered = await ctx.sessionModes.set(goalRequest);
          if (!entered.ok) { await engine.control('pause', entered.message ?? 'Native goal transition refused'); throw new Error(entered.message ?? `Goal transition failed (${entered.code})`); }
        }
        await progress(ctx, engine);
        try { await pi.sendUserMessage(objective(mode, settings), { attribution: 'agent' }); }
        catch (e) {
          await engine.control('pause', 'Host rejected the generated workflow prompt');
          if (goalRequest) { try { await ctx.sessionModes.set({ mode: 'goal', action: 'pause' }); } catch { /* host may still be busy */ } }
          throw e;
        }
      } catch (e) { ctx.ui?.notify?.(`FAR: ${e.message}`, 'error'); show(`FAR did not start/complete the requested operation: ${e.message}`); }
    },
  });
  pi.on('session_start', async (_event, ctx) => {
    if (ctx.agent?.kind === 'sub') return;
    ctx.ui?.notify?.('Freeze Audit Remediate loaded — /far help; skill: freeze-audit-remediate; tool: far.', 'info');
    try { await progress(ctx, await engineFor(ctx)); } catch { /* Opening a non-Git directory must not break OMP. */ }
  });
  pi.on('before_agent_start', async (event, ctx) => {
    if (ctx.agent?.kind === 'sub') return; // Workers get the autoloaded skill and bounded assignment, not a new global goal.
    try {
      const engine = await engineFor(ctx), s = await engine.state(false);
      if (s?.status === 'active') {
        const sum = engine.summary(s);
        return { message: { customType: 'far-context', content: `${ACTIVE_CONTEXT}\nState: mode=${sum.mode}; stage=${sum.stage}; reviewed=${sum.coverage.reviewed}/${sum.coverage.total}; running=${sum.tasks.running}; blocked=${sum.tasks.blocked}. Refresh far_gate before completion.`, display: false, attribution: 'agent' } };
      }
      if (/feature[ -]freeze|codebase harden|bug squash|freeze.audit.remediate|\[FAR\]/i.test(event.prompt ?? ''))
        return { message: { customType: 'far-discovery', content: 'The Freeze Audit Remediate plugin is available. Read skill://freeze-audit-remediate and call far(action=help/start). It provides durable evidence, parallel task scheduling, model-aware agents and no user-testing gates. Do not initialize an unrelated workflow without the user request.', display: false, attribution: 'agent' } };
    } catch { /* Advertisement should not make ordinary sessions fail. */ }
  });
  pi.on('before_subagent_spawn', async (event, ctx) => {
    if (!FAR_AGENTS.includes(event.agent)) return;
    const engine = await engineFor(ctx), s = await engine.state(false);
    if (!s || s.status !== 'active') return;
    const current = await ctx.models?.current?.() ?? ctx.model;
    if (s.options.modelMode === 'current') {
      const selector = modelIdentity(current);
      if (!selector) return { block: true, reason: 'FAR current-model mode cannot resolve the current host model.' };
      return { model: [selector], note: 'FAR current-model mode explicitly pins this worker to the parent model.' };
    }
    // Preserve native operator overrides. Only use an explicit fallback when the native patterns all fail resolution.
    if (typeof ctx.models?.resolve === 'function' && event.patterns?.length) {
      let resolved = false;
      for (const p of event.patterns) { try { if (await ctx.models.resolve(p)) resolved = true; } catch { /* unresolved selector */ } }
      if (!resolved && modelIdentity(current)) return { model: [modelIdentity(current)], note: 'FAR native role unavailable; using the available parent model. No cost/capability equivalence claimed.' };
    }
  });
  // Observe turn metadata, not tool_result middleware: avoid disabling OMP's speculative task launch.
  pi.on('turn_end', async (event, ctx) => {
    if (ctx.agent?.kind === 'sub') return;
    try {
      const engine = await engineFor(ctx), s = await engine.state(false); if (!s) return;
      const records = [];
      for (const tool of event.toolResults ?? []) {
        if (tool.toolName !== 'task') continue;
        for (const r of tool.details?.results ?? []) {
          if (!FAR_AGENTS.includes(r.agent)) continue;
          const key = hash([tool.toolCallId, r.id, r.agent, r.resolvedModel, r.exitCode]);
          if (seenUsage.has(key)) continue; seenUsage.add(key);
          records.push({ observedAt: now(), observationKey: key, source: 'native-task-result-metadata', agent: r.agent, agentId: r.id ?? null,
            resolvedModel: serializable(r.resolvedModel ?? null), resolvedModelIdentity: serializable(r.resolvedModelIdentity ?? null),
            usage: serializable(r.usage ?? null), tokens: r.tokens ?? null, durationMs: r.durationMs ?? null, exitCode: r.exitCode ?? null });
        }
      }
      if (records.length) await engine.recordModelUsage(records);
      await progress(ctx, engine);
    } catch (e) { pi.logger?.warn?.(`FAR telemetry unavailable: ${e.message}`); }
  });
}
