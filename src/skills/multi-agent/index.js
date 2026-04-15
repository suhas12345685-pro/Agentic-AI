/**
 * Multi-Agent Coordinator
 *
 * Lightweight pub/sub blackboard used by specialist agents to share
 * intermediate findings during a complex task. The orchestrator
 * already owns DAG execution; this module complements it by giving
 * agents a shared "working memory" scoped to a single run.
 *
 * Also exports `SpecialistRegistry` for registering named agents with
 * system prompts and dispatch helpers.
 */

import { EventEmitter } from 'node:events';
import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:multi-agent');

export class Blackboard extends EventEmitter {
  constructor() {
    super();
    this.store = new Map();
  }

  write(key, value, { agent = 'unknown' } = {}) {
    const entry = { value, agent, ts: Date.now() };
    this.store.set(key, entry);
    this.emit('write', { key, ...entry });
    return entry;
  }

  read(key) {
    return this.store.get(key)?.value;
  }

  entries() {
    return [...this.store.entries()].map(([k, v]) => ({ key: k, ...v }));
  }

  clear() {
    this.store.clear();
  }
}

/**
 * A named specialist agent that wraps a system prompt.
 */
export class Specialist {
  constructor({ name, role, systemPrompt }) {
    this.name = name;
    this.role = role;
    this.systemPrompt = systemPrompt;
  }

  async respond(prompt, { blackboard } = {}) {
    const context = blackboard
      ? blackboard.entries().map(e => `- ${e.key} (from ${e.agent}): ${JSON.stringify(e.value).slice(0, 300)}`).join('\n')
      : '';

    const fullPrompt = context
      ? `Shared findings so far:\n${context}\n\nYour task: ${prompt}`
      : prompt;

    const answer = await routeQuery(fullPrompt, this.systemPrompt);
    if (blackboard) blackboard.write(`${this.name}:${Date.now()}`, answer, { agent: this.name });
    return answer;
  }
}

export class SpecialistRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(spec) {
    const agent = spec instanceof Specialist ? spec : new Specialist(spec);
    this.agents.set(agent.name, agent);
    return agent;
  }

  get(name) {
    return this.agents.get(name) ?? null;
  }

  list() {
    return [...this.agents.values()].map(a => ({ name: a.name, role: a.role }));
  }

  /**
   * Run a "debate" — every specialist responds to the same prompt and
   * a final aggregator produces the synthesis.
   */
  async debate(prompt, { blackboard = new Blackboard() } = {}) {
    log.info(`Debate with ${this.agents.size} specialists on: ${prompt.slice(0, 60)}`);
    const turns = [];
    for (const agent of this.agents.values()) {
      try {
        const out = await agent.respond(prompt, { blackboard });
        turns.push({ agent: agent.name, role: agent.role, output: out });
      } catch (err) {
        log.warn(`${agent.name} failed: ${err.message}`);
        turns.push({ agent: agent.name, role: agent.role, output: `Error: ${err.message}` });
      }
    }

    const synthesisPrompt =
      `Original question:\n${prompt}\n\n` +
      `Specialist opinions:\n` +
      turns.map(t => `[${t.agent} / ${t.role}]\n${t.output}`).join('\n\n') +
      `\n\nSynthesize a single, direct answer that integrates the strongest points.`;

    const synthesis = await routeQuery(synthesisPrompt);
    return { turns, synthesis, blackboard };
  }
}

/** A small set of handy default specialists. */
export function createDefaultRegistry() {
  const reg = new SpecialistRegistry();
  reg.register({
    name: 'researcher',
    role: 'Gathers facts and context',
    systemPrompt: 'You are a research specialist. Provide concise factual background. Do not speculate.',
  });
  reg.register({
    name: 'critic',
    role: 'Challenges claims and finds weaknesses',
    systemPrompt: 'You are a critical reviewer. Identify flaws, missing evidence, and counter-arguments.',
  });
  reg.register({
    name: 'strategist',
    role: 'Proposes concrete action plans',
    systemPrompt: 'You are a strategist. Propose actionable steps with trade-offs.',
  });
  return reg;
}

export default { Blackboard, Specialist, SpecialistRegistry, createDefaultRegistry };
