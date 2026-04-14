/**
 * Memory Manager
 * Unified interface for the 4-tier memory system.
 */

import { WorkingMemory } from './working.js';
import { EpisodicMemory } from './episodic.js';
import { SemanticMemory } from './semantic.js';
import { ProceduralMemory } from './procedural.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('memory');

export class MemoryManager {
  constructor() {
    this.working = new WorkingMemory();
    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticMemory();
    this.procedural = new ProceduralMemory();
    this.sessionId = `session_${Date.now()}`;
  }

  /**
   * Initialize all memory tiers.
   */
  async init() {
    log.info('Initializing memory system...');

    // Tier 1: Working memory (RAM, no init needed)
    log.info('T1 Working memory: ready');

    // Tier 2: Episodic memory (SQLite)
    try {
      this.episodic.init();
      log.info('T2 Episodic memory: ready');
    } catch (err) {
      log.warn(`T2 Episodic memory failed: ${err.message}`);
    }

    // Tier 3: Semantic memory (ChromaDB)
    try {
      await this.semantic.init();
      log.info('T3 Semantic memory: ready');
    } catch (err) {
      log.warn(`T3 Semantic memory failed: ${err.message}`);
    }

    // Tier 4: Procedural memory (JSON)
    try {
      this.procedural.init();
      log.info('T4 Procedural memory: ready');
    } catch (err) {
      log.warn(`T4 Procedural memory failed: ${err.message}`);
    }

    log.info('Memory system initialized');
  }

  /**
   * Add a conversation turn (stores in working + episodic).
   */
  addTurn(role, content) {
    this.working.addTurn(role, content);
    try {
      this.episodic.store(this.sessionId, role, content);
    } catch {
      // Episodic may not be available
    }
  }

  /**
   * Get current conversation context from working memory.
   */
  getContext() {
    return this.working.getContext();
  }

  /**
   * Recall relevant information across all tiers.
   */
  async recall(query) {
    const results = [];

    // Check working memory first (fastest)
    const workingResult = await this.working.recall(query);
    if (workingResult) results.push(workingResult);

    // Check semantic memory (most relevant)
    const semanticResult = await this.semantic.recall(query);
    if (semanticResult) results.push(semanticResult);

    // Check procedural memory
    const procedures = this.procedural.search(query);
    if (procedures.length > 0) {
      results.push(procedures.map(p => `[Procedure: ${p.name}] ${p.description || ''}`).join('\n'));
    }

    return results.length > 0 ? results.join('\n---\n') : null;
  }

  /**
   * Store a key-value pair in semantic + procedural memory.
   */
  async store(key, value) {
    if (typeof value === 'object' && value.description) {
      this.procedural.store(key, value);
    }
    await this.semantic.store(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  /**
   * Clean up resources.
   */
  close() {
    this.episodic.close();
    log.info('Memory system closed');
  }
}
