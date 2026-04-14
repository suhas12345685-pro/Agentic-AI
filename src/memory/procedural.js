/**
 * Tier 4: Procedural Memory
 * JSON-based storage for skills, tools, and how-to knowledge.
 * Stores learned procedures that JARVIS can recall and execute.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('memory:procedural');

const DEFAULT_PATH = './data/procedural.json';

export class ProceduralMemory {
  constructor(filePath) {
    this.filePath = filePath || DEFAULT_PATH;
    this.procedures = {};
  }

  /**
   * Load procedures from disk.
   */
  init() {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        this.procedures = JSON.parse(raw);
        log.info(`Loaded ${Object.keys(this.procedures).length} procedures`);
      } catch (err) {
        log.error(`Failed to load procedural memory: ${err.message}`);
        this.procedures = {};
      }
    } else {
      log.info('No existing procedural memory found, starting fresh');
      this.procedures = {};
    }
  }

  /**
   * Store a procedure (skill, how-to, or learned action).
   */
  store(name, procedure) {
    this.procedures[name] = {
      ...procedure,
      updated_at: Date.now(),
    };
    this._persist();
    log.debug(`Stored procedure: ${name}`);
  }

  /**
   * Recall a specific procedure by name.
   */
  recall(name) {
    return this.procedures[name] || null;
  }

  /**
   * Search procedures by keyword.
   */
  search(query) {
    const lower = query.toLowerCase();
    return Object.entries(this.procedures)
      .filter(([name, proc]) =>
        name.toLowerCase().includes(lower) ||
        (proc.description && proc.description.toLowerCase().includes(lower))
      )
      .map(([name, proc]) => ({ name, ...proc }));
  }

  /**
   * List all stored procedure names.
   */
  list() {
    return Object.keys(this.procedures);
  }

  /**
   * Remove a procedure.
   */
  remove(name) {
    delete this.procedures[name];
    this._persist();
  }

  /**
   * Persist to disk.
   */
  _persist() {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.procedures, null, 2));
    } catch (err) {
      log.error(`Failed to persist procedural memory: ${err.message}`);
    }
  }
}
