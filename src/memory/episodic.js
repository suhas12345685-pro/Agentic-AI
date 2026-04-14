/**
 * Tier 2: Episodic Memory
 * SQLite-backed persistent storage for past conversations.
 * Timestamped and searchable.
 */

import Database from 'better-sqlite3';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('memory:episodic');

export class EpisodicMemory {
  constructor(dbPath) {
    this.dbPath = dbPath || config.memory.sqlitePath;
    this.db = null;
  }

  /**
   * Initialize the database and create tables if needed.
   */
  init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
    `);

    log.info(`Episodic memory initialized at ${this.dbPath}`);
  }

  /**
   * Store a conversation turn.
   */
  store(sessionId, role, content, metadata = {}) {
    const stmt = this.db.prepare(
      'INSERT INTO episodes (session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(sessionId, role, content, Date.now(), JSON.stringify(metadata));
  }

  /**
   * Recall past conversations matching a query (simple text search).
   */
  recall(query, limit = 10) {
    const stmt = this.db.prepare(
      'SELECT role, content, timestamp FROM episodes WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?'
    );
    const pattern = `%${query}%`;
    return stmt.all(pattern, limit);
  }

  /**
   * Get all turns from a specific session.
   */
  getSession(sessionId) {
    const stmt = this.db.prepare(
      'SELECT role, content, timestamp FROM episodes WHERE session_id = ? ORDER BY timestamp ASC'
    );
    return stmt.all(sessionId);
  }

  /**
   * Get recent episodes across all sessions.
   */
  getRecent(limit = 20) {
    const stmt = this.db.prepare(
      'SELECT session_id, role, content, timestamp FROM episodes ORDER BY timestamp DESC LIMIT ?'
    );
    return stmt.all(limit);
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.db) {
      this.db.close();
      log.info('Episodic memory closed');
    }
  }
}
