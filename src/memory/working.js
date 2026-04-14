/**
 * Tier 1: Working Memory
 * In-RAM conversation context. Retains the last 20 turns.
 * Provides instant access for the current session.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('memory:working');

const MAX_TURNS = 20;

export class WorkingMemory {
  constructor() {
    this.turns = [];
  }

  /**
   * Add a conversation turn.
   * @param {'user'|'assistant'} role
   * @param {string} content
   */
  addTurn(role, content) {
    this.turns.push({ role, content, timestamp: Date.now() });

    if (this.turns.length > MAX_TURNS) {
      const evicted = this.turns.shift();
      log.debug(`Evicted oldest turn: ${evicted.role} (${evicted.content.slice(0, 40)}...)`);
    }
  }

  /**
   * Get conversation context as a formatted string for LLM injection.
   */
  getContext() {
    if (this.turns.length === 0) return '';

    return this.turns
      .map(t => `${t.role === 'user' ? 'User' : 'JARVIS'}: ${t.content}`)
      .join('\n');
  }

  /**
   * Simple keyword recall from recent turns.
   */
  async recall(query) {
    const lower = query.toLowerCase();
    const relevant = this.turns.filter(t =>
      t.content.toLowerCase().includes(lower) ||
      lower.split(/\s+/).some(word => t.content.toLowerCase().includes(word))
    );

    if (relevant.length === 0) return null;
    return relevant.map(t => `${t.role}: ${t.content}`).join('\n');
  }

  /**
   * Store a key-value pair (no-op for working memory — it's conversation-based).
   */
  async store(_key, _value) {
    // Working memory only stores conversation turns via addTurn()
  }

  /**
   * Get the number of stored turns.
   */
  get size() {
    return this.turns.length;
  }

  /**
   * Clear all turns.
   */
  clear() {
    this.turns = [];
    log.info('Working memory cleared');
  }
}
