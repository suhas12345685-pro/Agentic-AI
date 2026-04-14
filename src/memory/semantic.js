/**
 * Tier 3: Semantic Memory
 * ChromaDB-backed vector store for knowledge and facts.
 * Supports similarity search via embeddings.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('memory:semantic');

export class SemanticMemory {
  constructor() {
    this.client = null;
    this.collection = null;
    this.initialized = false;
  }

  /**
   * Initialize ChromaDB connection and collection.
   */
  async init() {
    try {
      const { ChromaClient } = await import('chromadb');
      this.client = new ChromaClient();
      this.collection = await this.client.getOrCreateCollection({
        name: 'jarvis_knowledge',
        metadata: { description: 'JARVIS semantic memory store' },
      });
      this.initialized = true;
      log.info('Semantic memory initialized (ChromaDB)');
    } catch (err) {
      log.warn(`ChromaDB not available: ${err.message}. Semantic memory disabled.`);
      this.initialized = false;
    }
  }

  /**
   * Store a fact or knowledge item.
   */
  async store(id, content, metadata = {}) {
    if (!this.initialized) return;

    try {
      await this.collection.add({
        ids: [id],
        documents: [content],
        metadatas: [{ ...metadata, timestamp: Date.now() }],
      });
      log.debug(`Stored semantic memory: ${id}`);
    } catch (err) {
      log.error(`Failed to store semantic memory: ${err.message}`);
    }
  }

  /**
   * Query for similar content using vector search.
   */
  async query(text, nResults = 5) {
    if (!this.initialized) return [];

    try {
      const results = await this.collection.query({
        queryTexts: [text],
        nResults,
      });
      return results.documents?.[0] || [];
    } catch (err) {
      log.error(`Semantic query failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Recall relevant knowledge for a query (unified interface).
   */
  async recall(query) {
    const docs = await this.query(query, 3);
    return docs.length > 0 ? docs.join('\n') : null;
  }
}
