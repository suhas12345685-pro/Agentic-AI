/**
 * ReAct Reasoning Loop — Hardened (Phase 2 Completion)
 *
 * Implements: Observe → Think → Act → Reflect → Diverge-if-stuck → Repeat
 *
 * The Reflection Module fingerprints every observation, detects when the
 * agent is walking in circles, and forces a DIVERGE step to reshape the
 * reasoning trajectory before burning through iterations. A soft safety
 * cap still exists but is no longer the primary termination signal.
 */

import { createHash } from 'node:crypto';
import { routeQuery } from './llm-router.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('react-loop');

// Soft safety cap — exists purely to prevent runaway cost in pathological
// cases. The Reflection Module is the *primary* loop-breaking mechanism.
const ABSOLUTE_MAX_ITERATIONS = 25;

// How many identical observation fingerprints in a row before we DIVERGE.
const LOOP_DETECTION_THRESHOLD = 2;

// How many DIVERGE attempts we allow before we give up and surface the
// partial trace to the caller.
const MAX_DIVERGE_ATTEMPTS = 2;

const REACT_SYSTEM_PROMPT = `You are JARVIS, an agentic AI assistant. You solve tasks using the ReAct framework.

For each step, output EXACTLY one of:
THOUGHT: <your reasoning about what to do next>
ACTION: <tool_name>(<arguments>)
OBSERVATION: <result of the action — this will be filled in by the system>
ANSWER: <your final answer to the user>
DIVERGE: <a completely different approach to the problem>

Available tools:
- web_search(query): Search the internet for current information
- run_code(language, code): Execute code in a sandbox
- read_file(path): Read a file from the filesystem
- write_file(path, content): Write content to a file
- memory_recall(query): Search long-term memory for relevant information
- memory_store(key, value): Store information in long-term memory

Always start with THOUGHT. End with ANSWER when you have enough information.
If the system injects "[REFLECTION] You are looping", you MUST respond with a DIVERGE step proposing a genuinely new angle — do not repeat a prior ACTION.`;

const STEP_PREFIXES = ['THOUGHT:', 'ACTION:', 'OBSERVATION:', 'ANSWER:', 'DIVERGE:'];

/* ------------------------------------------------------------------ *
 * Parsing helpers
 * ------------------------------------------------------------------ */

function parseStep(output) {
  if (!output || typeof output !== 'string') {
    return { type: 'answer', content: '' };
  }

  const trimmed = output.trim();

  for (const prefix of STEP_PREFIXES) {
    if (trimmed.toUpperCase().startsWith(prefix)) {
      return {
        type: prefix.replace(':', '').toLowerCase(),
        content: trimmed.slice(prefix.length).trim(),
      };
    }
  }

  // If the LLM ignores the protocol, treat the raw text as a final answer
  // rather than looping forever on a parse failure.
  return { type: 'answer', content: trimmed };
}

function parseAction(actionStr) {
  // Handles `tool_name(args)` and tolerates newlines inside args.
  const match = actionStr.match(/^(\w+)\s*\(([\s\S]*)\)\s*$/);
  if (!match) return null;
  return { tool: match[1], args: match[2].trim() };
}

/* ------------------------------------------------------------------ *
 * Reflection Module — state fingerprinting & loop detection
 * ------------------------------------------------------------------ */

class ReflectionModule {
  constructor({ threshold = LOOP_DETECTION_THRESHOLD } = {}) {
    this.threshold = threshold;
    this.observationHistory = []; // [{ hash, raw, step }]
    this.actionHistory = [];      // [{ hash, raw, step }]
    this.divergeAttempts = 0;
  }

  /** Deterministic, cheap fingerprint of a string. */
  static fingerprint(value) {
    const normalized = String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  }

  recordObservation(raw, stepIndex) {
    const hash = ReflectionModule.fingerprint(raw);
    this.observationHistory.push({ hash, raw, step: stepIndex });
    return hash;
  }

  recordAction(raw, stepIndex) {
    const hash = ReflectionModule.fingerprint(raw);
    this.actionHistory.push({ hash, raw, step: stepIndex });
    return hash;
  }

  /**
   * Detect loop conditions:
   *   1. The last N observations share the same fingerprint.
   *   2. The last N actions share the same fingerprint (agent replaying
   *      the same tool call hoping for a different answer).
   */
  detectLoop() {
    const obsLoop = this._tailAllEqual(this.observationHistory, this.threshold);
    const actLoop = this._tailAllEqual(this.actionHistory, this.threshold);

    if (obsLoop) return { looping: true, reason: 'observation_repeat' };
    if (actLoop) return { looping: true, reason: 'action_repeat' };
    return { looping: false };
  }

  _tailAllEqual(history, n) {
    if (history.length < n) return false;
    const tail = history.slice(-n);
    const first = tail[0].hash;
    return tail.every(entry => entry.hash === first);
  }

  registerDiverge() {
    this.divergeAttempts += 1;
    return this.divergeAttempts;
  }

  shouldAbort() {
    return this.divergeAttempts >= MAX_DIVERGE_ATTEMPTS;
  }

  summary() {
    return {
      observations: this.observationHistory.length,
      actions: this.actionHistory.length,
      diverges: this.divergeAttempts,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Tool execution — aggressive error handling
 * ------------------------------------------------------------------ */

async function executeTool(tool, args, skillExecutor) {
  if (!skillExecutor) {
    return {
      ok: false,
      observation: `Tool "${tool}" is not available — no skill executor registered.`,
    };
  }

  if (typeof skillExecutor.execute !== 'function') {
    return {
      ok: false,
      observation: `Tool executor is misconfigured (missing execute()).`,
    };
  }

  try {
    const result = await skillExecutor.execute(tool, args);
    const observation = result === undefined || result === null
      ? `Tool ${tool} returned no output.`
      : typeof result === 'string' ? result : JSON.stringify(result);
    return { ok: true, observation };
  } catch (err) {
    log.error(`Tool execution failed: ${tool}(${args}) — ${err.message}`);
    return {
      ok: false,
      observation: `Error executing ${tool}: ${err.message}`,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Main loop
 * ------------------------------------------------------------------ */

/**
 * Run the hardened ReAct loop for a user query.
 *
 * @param {string} query - The user's input.
 * @param {object} [options]
 * @param {object} [options.skillExecutor]     - Skill executor for tool use.
 * @param {object} [options.memory]            - Memory manager for context injection.
 * @param {AbortSignal} [options.signal]       - Cooperative cancellation.
 * @param {number} [options.maxIterations]     - Override the safety cap.
 * @returns {Promise<{ answer: string, trace: object[], stopReason: string }>}
 */
export async function react(query, options = {}) {
  const {
    skillExecutor,
    memory,
    signal,
    maxIterations = ABSOLUTE_MAX_ITERATIONS,
  } = options;

  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new TypeError('react(): query must be a non-empty string');
  }

  const reflection = new ReflectionModule();
  const trace = [];
  let context = `User query: ${query}\n\n`;

  // Inject memory context defensively — memory failures must not kill the loop.
  if (memory && typeof memory.recall === 'function') {
    try {
      const recalled = await memory.recall(query);
      if (recalled) context += `Relevant memory:\n${recalled}\n\n`;
    } catch (err) {
      log.warn(`Memory recall failed, continuing without: ${err.message}`);
    }
  }

  log.info(`Starting ReAct loop for: "${query.slice(0, 80)}"`);

  let stopReason = 'unknown';

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted) {
      stopReason = 'aborted';
      log.warn('ReAct loop aborted by caller signal');
      break;
    }

    let output;
    try {
      output = await routeQuery(context + 'Next step:', REACT_SYSTEM_PROMPT);
    } catch (err) {
      log.error(`LLM call failed at step ${i + 1}: ${err.message}`);
      stopReason = 'llm_failure';
      trace.push({ type: 'error', content: err.message });
      break;
    }

    const step = parseStep(output);
    trace.push(step);
    log.info(`Step ${i + 1}: ${step.type} — ${step.content.slice(0, 100)}`);

    /* -------- Terminal: ANSWER -------- */
    if (step.type === 'answer') {
      stopReason = 'answer';
      if (memory && typeof memory.store === 'function') {
        try {
          await memory.store(`react:${Date.now()}`, {
            query,
            answer: step.content,
            steps: trace.length,
            reflection: reflection.summary(),
          });
        } catch (err) {
          log.warn(`Memory store failed: ${err.message}`);
        }
      }
      return { answer: step.content, trace, stopReason };
    }

    /* -------- DIVERGE accepted from LLM -------- */
    if (step.type === 'diverge') {
      const attempt = reflection.registerDiverge();
      log.info(`LLM chose to DIVERGE (attempt ${attempt}): ${step.content.slice(0, 80)}`);
      context += `DIVERGE: ${step.content}\n\n`;
      if (reflection.shouldAbort()) {
        stopReason = 'diverge_exhausted';
        break;
      }
      continue;
    }

    /* -------- ACTION -------- */
    if (step.type === 'action') {
      reflection.recordAction(step.content, i);
      const parsed = parseAction(step.content);

      if (!parsed) {
        context += `ACTION: ${step.content}\nOBSERVATION: Could not parse action. Use: tool_name(arguments)\n\n`;
        continue;
      }

      const { observation } = await executeTool(parsed.tool, parsed.args, skillExecutor);
      reflection.recordObservation(observation, i);
      context += `ACTION: ${step.content}\nOBSERVATION: ${observation}\n\n`;

      // Reflection: are we going in circles?
      const loop = reflection.detectLoop();
      if (loop.looping) {
        const attempt = reflection.registerDiverge();
        log.warn(`Loop detected (${loop.reason}) — forcing DIVERGE (attempt ${attempt})`);

        if (reflection.shouldAbort()) {
          stopReason = 'diverge_exhausted';
          log.error('Diverge attempts exhausted, aborting loop');
          break;
        }

        context +=
          `[REFLECTION] You are looping (${loop.reason}). ` +
          `Repeating the same approach will not change the outcome. ` +
          `Respond with a DIVERGE step that proposes a materially different strategy.\n\n`;
      }
      continue;
    }

    /* -------- THOUGHT (default) -------- */
    context += `THOUGHT: ${step.content}\n`;
  }

  if (stopReason === 'unknown') stopReason = 'max_iterations';

  log.warn(`ReAct loop terminated: ${stopReason} (${JSON.stringify(reflection.summary())})`);

  const lastContent = trace.length > 0 ? trace[trace.length - 1].content : '';
  const fallback = lastContent ||
    'I was unable to reach a conclusion within my reasoning limits, Sir.';

  return { answer: fallback, trace, stopReason };
}

// Exposed for tests and for the orchestrator's introspection tooling.
export { ReflectionModule, parseStep, parseAction };
