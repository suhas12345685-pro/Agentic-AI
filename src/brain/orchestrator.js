/**
 * JARVIS Orchestrator
 * Central coordinator that ties together the brain, memory, skills, and personality.
 *
 * Flow:
 *   User input → Intent classification → Memory injection → LLM routing →
 *   ReAct loop (if complex) → Personality wrapper → Response
 */

import { classifyQuery, routeQuery } from './llm-router.js';
import { react } from './react-loop.js';
import { createPlan, executePlan } from './planner.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('orchestrator');

export class Orchestrator {
  constructor({ memory, skillExecutor, personality }) {
    this.memory = memory;
    this.skillExecutor = skillExecutor;
    this.personality = personality;
  }

  /**
   * Process a user message end-to-end.
   */
  async process(userMessage) {
    log.info(`Processing: "${userMessage.slice(0, 80)}"`);

    // Store in working memory
    if (this.memory) {
      this.memory.addTurn('user', userMessage);
    }

    const taskType = classifyQuery(userMessage);
    let response;

    try {
      if (this._isComplexTask(userMessage, taskType)) {
        // Use ReAct loop for complex multi-step tasks
        log.info('Using ReAct loop for complex task');
        response = await react(userMessage, {
          skillExecutor: this.skillExecutor,
          memory: this.memory,
        });
      } else if (taskType === 'search') {
        // Route through search skill first, then LLM
        response = await this._handleSearch(userMessage);
      } else {
        // Direct LLM call for simple queries
        const systemPrompt = this.personality ? this.personality.getSystemPrompt() : '';
        const context = this.memory ? this.memory.getContext() : '';
        const prompt = context ? `${context}\n\nUser: ${userMessage}` : userMessage;
        response = await routeQuery(prompt, systemPrompt);
      }
    } catch (err) {
      log.error(`Processing failed: ${err.message}`);
      response = 'I encountered an unexpected error, Sir. My systems will recover shortly.';
    }

    // Apply personality wrapper
    if (this.personality) {
      response = this.personality.wrap(response);
    }

    // Store assistant response in working memory
    if (this.memory) {
      this.memory.addTurn('assistant', response);
    }

    return response;
  }

  /**
   * Determine if a task needs the full ReAct loop.
   */
  _isComplexTask(message, taskType) {
    const complexIndicators = ['step by step', 'plan', 'analyze', 'compare', 'research', 'investigate', 'build', 'create a'];
    const lower = message.toLowerCase();
    return complexIndicators.some(indicator => lower.includes(indicator));
  }

  /**
   * Handle search-type queries.
   */
  async _handleSearch(message) {
    if (this.skillExecutor) {
      try {
        const searchResult = await this.skillExecutor.execute('web_search', message);
        const prompt = `Based on these search results:\n${searchResult}\n\nAnswer the user's question: ${message}`;
        return await routeQuery(prompt);
      } catch {
        log.warn('Search skill failed, falling back to direct LLM');
      }
    }
    return await routeQuery(message);
  }
}
