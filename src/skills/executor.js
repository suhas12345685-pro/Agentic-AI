/**
 * Skill Executor
 * Central dispatcher for all skill/tool execution. The ReAct loop,
 * orchestrator, and Gateway all route tool calls through here.
 *
 * Built-in skills:
 *   web_search, run_code, read_file, write_file,
 *   rag_ingest, rag_ask, screen_describe,
 *   system_snapshot, browser_run, cicd_run,
 *   memory_recall, memory_store  (wired at boot by index.js),
 *   cdkt_map, cdkt_synthesise, cdkt_council  (CDKT framework).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '../utils/logger.js';

// Skill modules
import webSearch from './web-search/index.js';
import codeExec from './code-exec/index.js';
import screenVision from './screen-vision/index.js';
import { registerCDKTSkills } from './cdkt/index.js';
import systemMonitor from './system-monitor/index.js';

const log = createLogger('skill-executor');

export class SkillExecutor {
  constructor() {
    this.skills = new Map();
  }

  register(name, handler) {
    this.skills.set(name, handler);
    log.info(`Registered skill: ${name}`);
  }

  async execute(name, args) {
    const handler = this.skills.get(name);
    if (!handler) {
      log.warn(`Unknown skill: ${name}`);
      return `Skill "${name}" is not registered. Available: ${[...this.skills.keys()].join(', ')}`;
    }
    log.info(`Executing skill: ${name}`);
    try {
      return await handler(args);
    } catch (err) {
      log.error(`Skill ${name} failed: ${err.message}`);
      throw err;
    }
  }

  list() {
    return [...this.skills.keys()];
  }
}

/**
 * Build a SkillExecutor pre-loaded with the built-in skills.
 *
 * Optional deps:
 *   - rag:       a RagEngine instance (enables rag_* tools)
 *   - browser:   a BrowserAuto instance (enables browser_run)
 *   - cicd:      a CiCdPipeline instance (enables cicd_run)
 */
export function createSkillExecutor({ rag, browser, cicd } = {}) {
  const executor = new SkillExecutor();

  // --- web search ------------------------------------------------------
  executor.register('web_search', async (query) => {
    return webSearch.search(String(query));
  });

  // --- file i/o --------------------------------------------------------
  executor.register('read_file', async (filePath) => {
    const clean = String(filePath).replace(/['"]/g, '').trim();
    return readFileSync(clean, 'utf-8');
  });

  executor.register('write_file', async (args) => {
    const commaIdx = String(args).indexOf(',');
    if (commaIdx === -1) return 'Error: write_file requires "path, content"';
    const filePath = args.slice(0, commaIdx).replace(/['"]/g, '').trim();
    const content = args.slice(commaIdx + 1).trim();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return `Written to ${filePath}`;
  });

  // --- code execution --------------------------------------------------
  executor.register('run_code', async (args) => {
    const { language, code } = codeExec.parseArgs(args);
    const result = await codeExec.runCode({ language, code });
    return codeExec.formatResult(result);
  });

  // --- screen vision ---------------------------------------------------
  executor.register('screen_describe', async (prompt) => {
    return screenVision.describeScreen(prompt || undefined);
  });

  // --- system monitor --------------------------------------------------
  executor.register('system_snapshot', async () => {
    const snap = await systemMonitor.snapshot();
    return systemMonitor.formatSnapshot(snap);
  });

  // --- RAG (if available) ----------------------------------------------
  if (rag) {
    executor.register('rag_ingest', async (pathOrText) => {
      const arg = String(pathOrText).trim();
      if (arg.startsWith('text:')) {
        const r = await rag.ingestText(arg.slice(5), 'inline');
        return `Ingested inline text: ${r.chunks} chunks`;
      }
      if (arg.endsWith('/') || !arg.includes('.')) {
        const rs = await rag.ingestDir(arg);
        return `Ingested ${rs.length} files from ${arg}`;
      }
      const r = await rag.ingestFile(arg);
      return `Ingested ${arg}: ${r.chunks} chunks`;
    });

    executor.register('rag_ask', async (question) => {
      const { answer } = await rag.ask(String(question));
      return answer;
    });
  }

  // --- browser automation (if available) -------------------------------
  if (browser) {
    executor.register('browser_run', async (args) => {
      let ops;
      try { ops = JSON.parse(String(args)); } catch {
        return 'browser_run: args must be a JSON array of ops';
      }
      const result = await browser.runScript(ops);
      return JSON.stringify({ ok: result.ok, data: result.data, error: result.error });
    });
  }

  // --- CI/CD (if available) --------------------------------------------
  if (cicd) {
    executor.register('cicd_run', async () => {
      const outcome = await cicd.runWithAutofix();
      return JSON.stringify({
        ok: outcome.ok,
        failedAt: outcome.failedAt ?? null,
        fixSuggestion: outcome.fixSuggestion ?? null,
      });
    });
  }

  // --- memory placeholders (wired by boot) -----------------------------
  executor.register('memory_recall', async (query) =>
    `Memory recall for "${query}" — connect memory manager at runtime.`);
  executor.register('memory_store', async () =>
    'Memory store — connect memory manager at runtime.');

  // --- CDKT: cross-domain knowledge transfer ---------------------------
  registerCDKTSkills(executor);

  return executor;
}
