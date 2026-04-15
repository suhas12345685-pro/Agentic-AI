/**
 * RAG Engine
 * Ingests documents (txt/md/json) into the SemanticMemory vector store
 * and answers queries with retrieved context.
 *
 * Usage:
 *   const rag = new RagEngine({ semantic });
 *   await rag.ingestFile('./notes/plan.md');
 *   await rag.ingestDir('./docs');
 *   const { answer, sources } = await rag.ask('What is the roadmap?');
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:rag-engine');

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.json', '.log', '.csv']);
const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 120;

function hashId(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 24);
}

/**
 * Split text into overlapping chunks on sentence/paragraph boundaries
 * where possible.
 */
export function chunkText(text, size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/\r\n/g, '\n');
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    // try to break on a sentence boundary within the last 25% of the window
    if (end < clean.length) {
      const window = clean.slice(i + Math.floor(size * 0.75), end);
      const idx = Math.max(window.lastIndexOf('.'), window.lastIndexOf('\n'));
      if (idx !== -1) end = i + Math.floor(size * 0.75) + idx + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks.filter(Boolean);
}

export class RagEngine {
  /**
   * @param {{ semantic: import('../../memory/semantic.js').SemanticMemory }} deps
   */
  constructor({ semantic }) {
    if (!semantic) throw new TypeError('RagEngine requires a SemanticMemory instance');
    this.semantic = semantic;
    this.docs = new Map(); // id → { source, chunks }
  }

  /**
   * Ingest raw text with an associated source label.
   */
  async ingestText(text, source = 'inline') {
    const chunks = chunkText(text);
    let stored = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${hashId(source)}-${i}-${hashId(chunk)}`;
      try {
        await this.semantic.store(id, chunk, { source, chunkIndex: i });
        stored += 1;
      } catch (err) {
        log.warn(`ingestText: store failed for chunk ${i}: ${err.message}`);
      }
    }
    this.docs.set(source, { source, chunks: chunks.length });
    log.info(`Ingested "${source}" — ${stored}/${chunks.length} chunks`);
    return { source, chunks: stored };
  }

  /**
   * Ingest a single text/markdown/json file.
   */
  async ingestFile(filePath) {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const ext = extname(filePath).toLowerCase();
    if (!TEXT_EXTS.has(ext)) {
      log.warn(`Skipping unsupported file type ${ext}: ${filePath}`);
      return { source: filePath, chunks: 0 };
    }
    const raw = readFileSync(filePath, 'utf-8');
    return this.ingestText(raw, filePath);
  }

  /**
   * Recursively ingest a directory.
   */
  async ingestDir(dirPath) {
    if (!existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
    const report = [];
    const walk = (d) => {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (TEXT_EXTS.has(extname(entry).toLowerCase())) report.push(full);
      }
    };
    walk(dirPath);
    const results = [];
    for (const f of report) {
      try { results.push(await this.ingestFile(f)); } catch (err) {
        log.error(`ingestFile ${f} failed: ${err.message}`);
      }
    }
    return results;
  }

  /**
   * Retrieve top-k chunks from the vector store.
   */
  async retrieve(query, k = 4) {
    if (!this.semantic?.query) return [];
    const docs = await this.semantic.query(query, k);
    return Array.isArray(docs) ? docs : [];
  }

  /**
   * Ask a question — retrieves top-k chunks and asks the LLM to answer
   * using only that context. Returns { answer, sources }.
   */
  async ask(question, { k = 4 } = {}) {
    const chunks = await this.retrieve(question, k);
    const context = chunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');

    if (!context) {
      return {
        answer: 'I have no relevant indexed knowledge on that, Sir.',
        sources: [],
      };
    }

    const system =
      'Answer the question using ONLY the provided context. ' +
      'Cite chunks by [number]. If the context does not answer the question, say so plainly.';
    const prompt = `Context:\n${context}\n\nQuestion: ${question}`;

    const answer = await routeQuery(prompt, system);
    return { answer, sources: chunks };
  }
}

export default RagEngine;
