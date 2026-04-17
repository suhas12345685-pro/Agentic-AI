/**
 * Self-Improvement Loop
 *
 * Periodically evaluates JARVIS's own performance by reviewing recent
 * episodic memory, detecting failure patterns, and asking the LLM to
 * suggest concrete improvements (prompt edits, skill configs, cron tasks).
 * Approved suggestions are written back into the system.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('skill:self-improvement');

const REFLECTION_PROMPT = `You are JARVIS's self-improvement module. Analyse the following recent interaction log and identify:
1. Repeated failure patterns (errors, misunderstood requests, loops)
2. Skills that are missing or underperforming
3. One concrete, safe improvement action

Output JSON:
{
  "failures": ["short description of each pattern"],
  "suggestions": [
    { "type": "prompt_patch" | "skill_config" | "cron_task", "description": "what to change", "payload": {} }
  ],
  "summary": "one-sentence summary of findings"
}

Rules:
- Suggest at most 3 improvements per cycle
- Only suggest safe, reversible changes
- If no issues found, return empty arrays with summary "No issues detected"`;

export class SelfImprovementLoop {
  /**
   * @param {{
   *   memory?: object,
   *   intervalMs?: number,
   *   autoApply?: boolean,
   *   maxSuggestionsPerCycle?: number
   * }} opts
   */
  constructor({ memory, intervalMs = 3_600_000, autoApply = false, maxSuggestionsPerCycle = 3 } = {}) {
    this.memory = memory;
    this.intervalMs = intervalMs;
    this.autoApply = autoApply;
    this.maxSuggestionsPerCycle = maxSuggestionsPerCycle;
    this.timer = null;
    this.cycleCount = 0;
    this.history = [];
  }

  start() {
    if (this.timer) return;
    log.info(`Self-improvement loop started (interval ${this.intervalMs}ms, autoApply=${this.autoApply})`);
    this.timer = setInterval(() => this._cycle().catch(err => log.error(err.message)), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    log.info('Self-improvement loop stopped');
  }

  async runOnce() {
    return this._cycle();
  }

  async _cycle() {
    this.cycleCount++;
    log.info(`Self-improvement cycle #${this.cycleCount} starting`);

    const interactions = await this._fetchRecentInteractions();
    if (interactions.length === 0) {
      log.info('No recent interactions to analyse');
      return { summary: 'No interactions to analyse', suggestions: [] };
    }

    const logText = interactions
      .map(i => `[${new Date(i.timestamp).toISOString()}] user: ${i.user_message}\njarvis: ${i.assistant_message}\n${i.error ? `ERROR: ${i.error}` : ''}`)
      .join('\n---\n');

    const prompt = `Recent interactions (last ${interactions.length}):\n\n${logText}`;
    let analysis;

    try {
      const raw = await routeQuery(prompt, REFLECTION_PROMPT);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { failures: [], suggestions: [], summary: raw.slice(0, 200) };
    } catch (err) {
      log.error(`Analysis parse error: ${err.message}`);
      analysis = { failures: [], suggestions: [], summary: 'Analysis failed' };
    }

    analysis.suggestions = (analysis.suggestions || []).slice(0, this.maxSuggestionsPerCycle);

    log.info(`Cycle #${this.cycleCount} — ${analysis.summary}`);
    if (analysis.failures?.length) log.warn(`Patterns: ${analysis.failures.join('; ')}`);

    const applied = [];
    for (const suggestion of analysis.suggestions) {
      if (this.autoApply) {
        const ok = await this._applySuggestion(suggestion);
        applied.push({ suggestion, ok });
      } else {
        log.info(`[pending-approval] ${suggestion.type}: ${suggestion.description}`);
        applied.push({ suggestion, ok: false, reason: 'autoApply disabled' });
      }
    }

    const record = { cycleCount: this.cycleCount, timestamp: Date.now(), analysis, applied };
    this.history.push(record);
    if (this.history.length > 50) this.history.shift();

    return record;
  }

  async _fetchRecentInteractions(limit = 20) {
    try {
      if (this.memory?.episodic?.db) {
        const rows = this.memory.episodic.db
          .prepare('SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?')
          .all(limit);
        return rows.reverse();
      }
    } catch (err) {
      log.error(`Failed to fetch interactions: ${err.message}`);
    }
    return [];
  }

  async _applySuggestion(suggestion) {
    try {
      if (suggestion.type === 'prompt_patch' && suggestion.payload?.file && suggestion.payload?.patch) {
        const filePath = resolve(__dirname, '../../..', suggestion.payload.file);
        const current = await readFile(filePath, 'utf8').catch(() => '');
        const updated = current + '\n// [self-improvement] ' + suggestion.description + '\n';
        await writeFile(filePath + '.suggestion', updated);
        log.info(`Prompt patch written to ${filePath}.suggestion`);
        return true;
      }

      if (suggestion.type === 'skill_config' && suggestion.payload) {
        log.info(`Skill config suggestion noted: ${JSON.stringify(suggestion.payload)}`);
        return true;
      }

      if (suggestion.type === 'cron_task' && suggestion.payload?.expression && suggestion.payload?.task) {
        log.info(`Cron suggestion: ${suggestion.payload.expression} → ${suggestion.payload.task}`);
        return true;
      }

      log.warn(`Unknown suggestion type: ${suggestion.type}`);
      return false;
    } catch (err) {
      log.error(`Apply suggestion failed: ${err.message}`);
      return false;
    }
  }

  snapshot() {
    return {
      cycleCount: this.cycleCount,
      intervalMs: this.intervalMs,
      autoApply: this.autoApply,
      historyLength: this.history.length,
      lastCycle: this.history[this.history.length - 1] || null,
    };
  }
}

export default SelfImprovementLoop;
