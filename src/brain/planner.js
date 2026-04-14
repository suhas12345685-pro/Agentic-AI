/**
 * Long-Horizon Planner
 * Breaks complex goals into executable sub-tasks with dependencies.
 *
 * Uses the LLM to decompose a high-level goal into a DAG of tasks,
 * then executes them respecting dependency order.
 */

import { routeQuery } from './llm-router.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('planner');

const PLANNER_SYSTEM_PROMPT = `You are JARVIS's planning module. Given a complex goal, decompose it into a list of concrete sub-tasks.

Output format (JSON array):
[
  { "id": 1, "task": "description", "depends_on": [], "tool": "tool_name or null" },
  { "id": 2, "task": "description", "depends_on": [1], "tool": "tool_name or null" }
]

Rules:
- Each task should be atomic and executable
- Use depends_on to express ordering constraints
- Available tools: web_search, run_code, read_file, write_file, memory_recall
- If no tool is needed, set tool to null
- Maximum 10 tasks per plan`;

/**
 * Generate a plan for a complex goal.
 */
export async function createPlan(goal) {
  log.info(`Creating plan for: "${goal.slice(0, 80)}"`);

  const prompt = `Goal: ${goal}\n\nDecompose this into an ordered list of sub-tasks.`;
  const response = await routeQuery(prompt, PLANNER_SYSTEM_PROMPT);

  try {
    // Extract JSON from response (LLM may wrap it in markdown code blocks)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.warn('Planner did not return valid JSON, using single-task fallback');
      return [{ id: 1, task: goal, depends_on: [], tool: null, status: 'pending' }];
    }

    const tasks = JSON.parse(jsonMatch[0]);
    return tasks.map(t => ({ ...t, status: 'pending' }));
  } catch (err) {
    log.error(`Failed to parse plan: ${err.message}`);
    return [{ id: 1, task: goal, depends_on: [], tool: null, status: 'pending' }];
  }
}

/**
 * Execute a plan step by step, respecting dependencies.
 */
export async function executePlan(plan, options = {}) {
  const { skillExecutor, onProgress } = options;
  const results = {};

  while (plan.some(t => t.status === 'pending')) {
    // Find tasks whose dependencies are all completed
    const ready = plan.filter(t =>
      t.status === 'pending' &&
      t.depends_on.every(depId => {
        const dep = plan.find(d => d.id === depId);
        return dep && dep.status === 'completed';
      })
    );

    if (ready.length === 0) {
      log.error('Deadlock detected — no tasks can proceed');
      break;
    }

    for (const task of ready) {
      task.status = 'in_progress';
      log.info(`Executing task ${task.id}: ${task.task}`);

      if (onProgress) onProgress(task);

      try {
        if (task.tool && skillExecutor) {
          results[task.id] = await skillExecutor.execute(task.tool, task.task);
        } else {
          results[task.id] = await routeQuery(task.task);
        }
        task.status = 'completed';
      } catch (err) {
        log.error(`Task ${task.id} failed: ${err.message}`);
        task.status = 'failed';
        results[task.id] = `Error: ${err.message}`;
      }
    }
  }

  return results;
}
