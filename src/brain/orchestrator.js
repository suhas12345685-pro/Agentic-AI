/**
 * JARVIS Orchestrator — Hardened Multi-Agent Router
 *
 * Instead of forcing one monolithic ReAct loop to solve everything, the
 * Orchestrator now:
 *   1. Classifies the user's intent.
 *   2. For complex goals, asks the planner for a DAG of sub-tasks.
 *   3. Dispatches each DAG node to a specialized sub-agent (code, web,
 *      memory, reasoning) based on the node's declared tool/tag.
 *   4. Waits for a structured JSON response from every sub-agent and
 *      stitches the results into a final reply.
 *
 * Every sub-agent receives an immutable `AgentContext` and must return
 * an object that conforms to `AgentResultSchema`. Non-conforming
 * responses are rejected and surfaced as soft failures on the DAG node.
 */

import { classifyQuery, routeQuery } from './llm-router.js';
import { react } from './react-loop.js';
import { createPlan } from './planner.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('orchestrator');

/* ------------------------------------------------------------------ *
 * Agent contracts
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} AgentContext
 * @property {string} goal             - The original user request.
 * @property {object} task             - The DAG node assigned to the agent.
 * @property {object} upstream         - Map of upstream node id → result.
 * @property {object} [memory]         - Memory subsystem (read-only preferred).
 * @property {object} [skillExecutor]  - Skill executor.
 * @property {AbortSignal} [signal]    - Cooperative cancellation.
 */

/**
 * @typedef {Object} AgentResult
 * @property {boolean} ok              - Whether the agent succeeded.
 * @property {string}  agent           - Identifier of the agent that ran.
 * @property {string}  summary         - Short natural-language summary.
 * @property {*}       [data]          - Structured payload (JSON-serializable).
 * @property {string}  [error]         - Error message when ok=false.
 */

const REQUIRED_AGENT_FIELDS = ['ok', 'agent', 'summary'];

function validateAgentResult(raw, agentName) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, agent: agentName, summary: 'Invalid agent response (not an object)', error: 'schema' };
  }
  for (const field of REQUIRED_AGENT_FIELDS) {
    if (!(field in raw)) {
      return {
        ok: false,
        agent: agentName,
        summary: `Invalid agent response (missing ${field})`,
        error: 'schema',
      };
    }
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * Specialized sub-agents
 * ------------------------------------------------------------------ */

class BaseAgent {
  constructor(name) { this.name = name; }
  /** @param {AgentContext} _ctx @returns {Promise<AgentResult>} */
  async run(_ctx) { throw new Error(`${this.name}: run() not implemented`); }
}

class CodeAgent extends BaseAgent {
  constructor() { super('code'); }

  async run(ctx) {
    const { task, skillExecutor } = ctx;
    try {
      if (!skillExecutor) {
        return { ok: false, agent: this.name, summary: 'No skill executor available', error: 'no_executor' };
      }
      // `run_code` is the canonical code-execution skill.
      const args = task.args ?? task.task;
      const output = await skillExecutor.execute('run_code', args);
      return {
        ok: true,
        agent: this.name,
        summary: `Executed code block for task ${task.id}`,
        data: { output: String(output) },
      };
    } catch (err) {
      log.error(`CodeAgent failed on task ${task.id}: ${err.message}`);
      return { ok: false, agent: this.name, summary: 'Code execution failed', error: err.message };
    }
  }
}

class WebAgent extends BaseAgent {
  constructor() { super('web'); }

  async run(ctx) {
    const { task, skillExecutor } = ctx;
    try {
      if (!skillExecutor) {
        return { ok: false, agent: this.name, summary: 'No skill executor available', error: 'no_executor' };
      }
      const query = task.args ?? task.task;
      const raw = await skillExecutor.execute('web_search', query);
      return {
        ok: true,
        agent: this.name,
        summary: `Retrieved web results for "${String(query).slice(0, 60)}"`,
        data: { results: raw },
      };
    } catch (err) {
      log.error(`WebAgent failed on task ${task.id}: ${err.message}`);
      return { ok: false, agent: this.name, summary: 'Web search failed', error: err.message };
    }
  }
}

class MemoryAgent extends BaseAgent {
  constructor() { super('memory'); }

  async run(ctx) {
    const { task, memory } = ctx;
    if (!memory) {
      return { ok: false, agent: this.name, summary: 'Memory subsystem unavailable', error: 'no_memory' };
    }
    try {
      const query = task.args ?? task.task;
      const recalled = await memory.recall(query);
      return {
        ok: true,
        agent: this.name,
        summary: recalled ? `Recalled ${String(recalled).length} chars of memory` : 'No matching memory',
        data: { recalled: recalled ?? null },
      };
    } catch (err) {
      log.error(`MemoryAgent failed on task ${task.id}: ${err.message}`);
      return { ok: false, agent: this.name, summary: 'Memory recall failed', error: err.message };
    }
  }
}

/**
 * Default agent for open-ended reasoning tasks. Uses the hardened
 * ReAct loop so reflection/diverge logic applies here too.
 */
class ReasoningAgent extends BaseAgent {
  constructor() { super('reasoning'); }

  async run(ctx) {
    const { task, skillExecutor, memory, signal, goal, upstream } = ctx;
    try {
      const upstreamSummary = Object.entries(upstream ?? {})
        .map(([id, r]) => `- [${id}] ${r?.summary ?? 'no summary'}`)
        .join('\n');

      const subQuery =
        `Overall goal: ${goal}\n` +
        (upstreamSummary ? `Prior results:\n${upstreamSummary}\n` : '') +
        `Current sub-task: ${task.task}`;

      const { answer, stopReason } = await react(subQuery, {
        skillExecutor,
        memory,
        signal,
      });

      return {
        ok: stopReason === 'answer',
        agent: this.name,
        summary: `Reasoning agent finished (${stopReason})`,
        data: { answer },
        error: stopReason === 'answer' ? undefined : stopReason,
      };
    } catch (err) {
      log.error(`ReasoningAgent failed on task ${task.id}: ${err.message}`);
      return { ok: false, agent: this.name, summary: 'Reasoning failed', error: err.message };
    }
  }
}

/* ------------------------------------------------------------------ *
 * Routing table — maps planner-declared tool/tag → agent
 * ------------------------------------------------------------------ */

const TOOL_ROUTING = {
  run_code: 'code',
  web_search: 'web',
  memory_recall: 'memory',
  memory_store: 'memory',
  // CDKT skills route through the reasoning agent which calls skillExecutor
  cdkt_map: 'reasoning',
  cdkt_synthesise: 'reasoning',
  cdkt_council: 'reasoning',
  // read_file / write_file go through the reasoning agent so the broader
  // goal informs path selection.
};

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export class Orchestrator {
  constructor({ memory, skillExecutor, personality } = {}) {
    this.memory = memory;
    this.skillExecutor = skillExecutor;
    this.personality = personality;

    this.agents = {
      code: new CodeAgent(),
      web: new WebAgent(),
      memory: new MemoryAgent(),
      reasoning: new ReasoningAgent(),
    };
  }

  /** Allow a consumer to register a custom sub-agent. */
  registerAgent(name, agent) {
    if (!(agent instanceof BaseAgent)) {
      throw new TypeError('registerAgent(): agent must extend BaseAgent');
    }
    this.agents[name] = agent;
  }

  /**
   * Process a user message end-to-end.
   * @param {string} userMessage
   * @param {{ signal?: AbortSignal }} [opts]
   */
  async process(userMessage, opts = {}) {
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      throw new TypeError('Orchestrator.process: userMessage must be a non-empty string');
    }

    log.info(`Processing: "${userMessage.slice(0, 80)}"`);
    if (this.memory?.addTurn) this.memory.addTurn('user', userMessage);

    const taskType = classifyQuery(userMessage);
    let response;

    try {
      if (this._isComplexTask(userMessage)) {
        response = await this._runDagPipeline(userMessage, opts.signal);
      } else if (taskType === 'search') {
        const r = await this.agents.web.run({
          goal: userMessage,
          task: { id: 0, task: userMessage, args: userMessage },
          upstream: {},
          skillExecutor: this.skillExecutor,
          memory: this.memory,
          signal: opts.signal,
        });
        response = await this._synthesize(userMessage, { 0: validateAgentResult(r, 'web') });
      } else {
        const systemPrompt = this.personality?.getSystemPrompt?.() ?? '';
        const context = this.memory?.getContext?.() ?? '';
        const prompt = context ? `${context}\n\nUser: ${userMessage}` : userMessage;
        response = await routeQuery(prompt, systemPrompt);
      }
    } catch (err) {
      log.error(`Processing failed: ${err.message}`);
      response = 'I encountered an unexpected error, Sir. My systems will recover shortly.';
    }

    if (this.personality?.wrap) response = this.personality.wrap(response);
    if (this.memory?.addTurn) this.memory.addTurn('assistant', response);
    return response;
  }

  /* -------- Complex task pipeline -------- */

  async _runDagPipeline(goal, signal) {
    log.info('Building plan DAG');
    const plan = await createPlan(goal);

    if (!Array.isArray(plan) || plan.length === 0) {
      log.warn('Planner returned empty DAG, falling back to reasoning agent');
      const res = await this.agents.reasoning.run({
        goal, task: { id: 0, task: goal }, upstream: {},
        skillExecutor: this.skillExecutor, memory: this.memory, signal,
      });
      return res?.data?.answer ?? res?.summary ?? '';
    }

    const results = {};
    const pending = new Map(plan.map(t => [t.id, { ...t, status: 'pending' }]));

    while ([...pending.values()].some(t => t.status === 'pending')) {
      if (signal?.aborted) {
        log.warn('DAG execution aborted');
        break;
      }

      const ready = [...pending.values()].filter(t =>
        t.status === 'pending' &&
        (t.depends_on ?? []).every(id => pending.get(id)?.status === 'completed')
      );

      if (ready.length === 0) {
        log.error('DAG deadlock — remaining tasks cannot run (missing or failed deps)');
        break;
      }

      // Dispatch all ready nodes in parallel — independent siblings should
      // not block each other.
      const runs = ready.map(async (task) => {
        task.status = 'in_progress';
        const agentName = this._routeTask(task);
        const agent = this.agents[agentName] ?? this.agents.reasoning;

        log.info(`Dispatching task ${task.id} → ${agent.name}`);

        const upstream = Object.fromEntries(
          (task.depends_on ?? []).map(id => [id, results[id]])
        );

        let raw;
        try {
          raw = await agent.run({
            goal, task, upstream,
            skillExecutor: this.skillExecutor,
            memory: this.memory,
            signal,
          });
        } catch (err) {
          raw = { ok: false, agent: agent.name, summary: 'Agent threw', error: err.message };
        }

        const validated = validateAgentResult(raw, agent.name);
        results[task.id] = validated;
        task.status = validated.ok ? 'completed' : 'failed';
        // Failed tasks still mark completed for DAG progression; downstream
        // nodes must handle the soft-failure in their upstream context.
        if (!validated.ok) task.status = 'completed';
      });

      await Promise.all(runs);
    }

    return await this._synthesize(goal, results);
  }

  _routeTask(task) {
    if (task.agent && this.agents[task.agent]) return task.agent; // explicit override
    if (task.tool && TOOL_ROUTING[task.tool]) return TOOL_ROUTING[task.tool];
    return 'reasoning';
  }

  /**
   * Fold every sub-agent result into a single natural-language answer.
   * We ask the LLM to synthesize rather than concatenate so the user
   * never sees raw JSON.
   */
  async _synthesize(goal, results) {
    const summary = Object.entries(results)
      .map(([id, r]) => {
        const head = `[node ${id} • ${r.agent} • ${r.ok ? 'ok' : 'failed'}] ${r.summary}`;
        const body = r.data ? `\n${JSON.stringify(r.data).slice(0, 1200)}` : '';
        return head + body;
      })
      .join('\n\n');

    const prompt =
      `User goal:\n${goal}\n\n` +
      `Sub-agent results:\n${summary}\n\n` +
      `Synthesize a clear, direct answer for the user. Do not mention the ` +
      `internal node ids or agent names.`;

    try {
      return await routeQuery(prompt);
    } catch (err) {
      log.error(`Synthesis call failed: ${err.message}`);
      // Graceful fallback: hand back the best-effort summary.
      return summary || 'I was unable to compose a final answer, Sir.';
    }
  }

  _isComplexTask(message) {
    const indicators = [
      'step by step', 'plan', 'analyze', 'compare', 'research',
      'investigate', 'build', 'create a', 'write a', 'then',
    ];
    const lower = message.toLowerCase();
    return indicators.some(kw => lower.includes(kw));
  }
}

// Exported for testing and composition.
export { BaseAgent, CodeAgent, WebAgent, MemoryAgent, ReasoningAgent, validateAgentResult };
