/**
 * Skill Executor
 * Central dispatcher for all skill/tool execution.
 * The ReAct loop calls this to execute actions.
 */

import { createLogger } from '../utils/logger.js';
import { config } from '../utils/config.js';

const log = createLogger('skill-executor');


export class SkillExecutor {
  constructor() {
    this.skills = new Map();
  }

  /**
   * Register a skill handler.
   */
  register(name, handler) {
    this.skills.set(name, handler);
    log.info(`Registered skill: ${name}`);
  }

  /**
   * Execute a skill by name.
   */
  async execute(name, args) {
    const handler = this.skills.get(name);
    if (!handler) {
      log.warn(`Unknown skill: ${name}`);
      return `Skill "${name}" is not registered. Available skills: ${[...this.skills.keys()].join(', ')}`;
    }

    log.info(`Executing skill: ${name}`);
    try {
      return await handler(args);
    } catch (err) {
      log.error(`Skill ${name} failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * List all registered skills.
   */
  list() {
    return [...this.skills.keys()];
  }
}

/**
 * Create a skill executor with default built-in skills.
 */
export function createSkillExecutor() {
  const executor = new SkillExecutor();

  // web_search skill
  executor.register('web_search', async (query) => {
    if (!config.skills.braveApiKey) {
      return 'Web search is not configured. Set BRAVE_SEARCH_API_KEY in .env.';
    }

    const { default: axios } = await import('axios');
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: 5 },
      headers: { 'X-Subscription-Token': config.skills.braveApiKey },
      timeout: 10000,
    });

    const results = response.data.web?.results || [];
    return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n');
  });

  // read_file skill
  executor.register('read_file', async (filePath) => {
    const { readFileSync } = await import('fs');
    const cleanPath = filePath.replace(/['"]/g, '').trim();
    return readFileSync(cleanPath, 'utf-8');
  });

  // write_file skill
  executor.register('write_file', async (args) => {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');

    // Parse "path, content" format
    const commaIdx = args.indexOf(',');
    if (commaIdx === -1) return 'Error: write_file requires path and content separated by comma';

    const filePath = args.slice(0, commaIdx).replace(/['"]/g, '').trim();
    const content = args.slice(commaIdx + 1).trim();

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return `Written to ${filePath}`;
  });

  // run_code skill
  executor.register('run_code', async (args) => {
    const { execSync } = await import('child_process');

    // Parse "language, code" format
    const commaIdx = args.indexOf(',');
    const language = commaIdx > -1 ? args.slice(0, commaIdx).trim() : 'python';
    const code = commaIdx > -1 ? args.slice(commaIdx + 1).trim() : args;

    const cmd = language === 'python' ? `python3 -c ${JSON.stringify(code)}` : `node -e ${JSON.stringify(code)}`;

    try {
      const output = execSync(cmd, {
        timeout: 30000,
        encoding: 'utf-8',
      });
      return output || '(no output)';
    } catch (err) {
      return `Error: ${err.stderr || err.message}`;
    }
  });

  // memory_recall skill (placeholder — connected at runtime)
  executor.register('memory_recall', async (query) => {
    return `Memory recall for "${query}" — connect memory manager at runtime.`;
  });

  // memory_store skill (placeholder — connected at runtime)
  executor.register('memory_store', async (args) => {
    return `Memory store — connect memory manager at runtime.`;
  });

  return executor;
}
