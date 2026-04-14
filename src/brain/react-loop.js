/**
 * ReAct Reasoning Loop
 * Implements: Observe → Think → Act → Repeat
 *
 * The loop allows JARVIS to:
 * - Break complex tasks into sub-tasks
 * - Use tools (skills) mid-reasoning
 * - Self-correct on unexpected results
 * - Know when to stop and produce a final answer
 */

import { routeQuery } from './llm-router.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('react-loop');

const MAX_ITERATIONS = 10;

const REACT_SYSTEM_PROMPT = `You are JARVIS, an agentic AI assistant. You solve tasks using the ReAct framework.

For each step, output EXACTLY one of:
THOUGHT: <your reasoning about what to do next>
ACTION: <tool_name>(<arguments>)
OBSERVATION: <result of the action — this will be filled in by the system>
ANSWER: <your final answer to the user>

Available tools:
- web_search(query): Search the internet for current information
- run_code(language, code): Execute code in a sandbox
- read_file(path): Read a file from the filesystem
- write_file(path, content): Write content to a file
- memory_recall(query): Search long-term memory for relevant information
- memory_store(key, value): Store information in long-term memory

Always start with THOUGHT. End with ANSWER when you have enough information.`;

/**
 * Parse the LLM output to extract the step type and content.
 */
function parseStep(output) {
  const trimmed = output.trim();

  for (const prefix of ['THOUGHT:', 'ACTION:', 'OBSERVATION:', 'ANSWER:']) {
    if (trimmed.startsWith(prefix)) {
      return {
        type: prefix.replace(':', '').toLowerCase(),
        content: trimmed.slice(prefix.length).trim(),
      };
    }
  }

  // If LLM doesn't follow format, treat as answer
  return { type: 'answer', content: trimmed };
}

/**
 * Parse an ACTION string like `tool_name(args)` into components.
 */
function parseAction(actionStr) {
  const match = actionStr.match(/^(\w+)\((.+)\)$/s);
  if (!match) return null;
  return { tool: match[1], args: match[2] };
}

/**
 * Execute a tool action. Returns the observation string.
 */
async function executeTool(tool, args, skillExecutor) {
  if (!skillExecutor) {
    return `Tool "${tool}" is not available — no skill executor registered.`;
  }

  try {
    const result = await skillExecutor.execute(tool, args);
    return String(result);
  } catch (err) {
    log.error(`Tool execution failed: ${tool}(${args}) — ${err.message}`);
    return `Error executing ${tool}: ${err.message}`;
  }
}

/**
 * Run the ReAct loop for a given user query.
 *
 * @param {string} query - The user's input
 * @param {object} [options] - Optional configuration
 * @param {object} [options.skillExecutor] - Skill executor for tool use
 * @param {object} [options.memory] - Memory manager for context injection
 * @returns {string} The final answer
 */
export async function react(query, options = {}) {
  const { skillExecutor, memory } = options;
  const trace = [];
  let context = `User query: ${query}\n\n`;

  // Inject memory context if available
  if (memory) {
    const recalled = await memory.recall(query);
    if (recalled) {
      context += `Relevant memory:\n${recalled}\n\n`;
    }
  }

  log.info(`Starting ReAct loop for: "${query.slice(0, 80)}..."`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const prompt = context + 'Next step:';
    const output = await routeQuery(prompt, REACT_SYSTEM_PROMPT);
    const step = parseStep(output);

    trace.push(step);
    log.info(`Step ${i + 1}: ${step.type} — ${step.content.slice(0, 100)}`);

    if (step.type === 'answer') {
      // Store the interaction in memory if available
      if (memory) {
        await memory.store(`react:${Date.now()}`, { query, answer: step.content, steps: trace.length });
      }
      return step.content;
    }

    if (step.type === 'action') {
      const parsed = parseAction(step.content);
      if (parsed) {
        const observation = await executeTool(parsed.tool, parsed.args, skillExecutor);
        context += `THOUGHT: (reasoning step)\nACTION: ${step.content}\nOBSERVATION: ${observation}\n\n`;
      } else {
        context += `THOUGHT: (reasoning step)\nACTION: ${step.content}\nOBSERVATION: Could not parse action format. Use: tool_name(arguments)\n\n`;
      }
    } else {
      // Thought step — append and continue
      context += `THOUGHT: ${step.content}\n`;
    }
  }

  log.warn('ReAct loop hit max iterations');
  return trace.length > 0 ? trace[trace.length - 1].content : 'I was unable to reach a conclusion within my reasoning limit, Sir.';
}
