/**
 * Headless CI/CD Pipeline Skill
 *
 * Runs a configurable sequence of shell steps (install, lint, test,
 * build, deploy) against a project directory and — on failure — asks
 * the LLM for a patch suggestion. Designed to be invoked by the
 * orchestrator, a cron job, or directly from the CLI.
 */

import { spawn } from 'node:child_process';
import { routeQuery } from '../../brain/llm-router.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:cicd');

function runStep(cmd, { cwd, env, timeoutMs = 10 * 60_000 } = {}) {
  return new Promise((resolve) => {
    log.info(`▶ ${cmd}`);
    const child = spawn(cmd, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ cmd, code, stdout, stderr, timedOut, ok: code === 0 && !timedOut });
    });
  });
}

const DEFAULT_PIPELINE = [
  { name: 'install', cmd: 'npm install --no-audit --no-fund' },
  { name: 'lint', cmd: 'npm run lint --if-present' },
  { name: 'test', cmd: 'npm test --if-present' },
  { name: 'build', cmd: 'npm run build --if-present' },
];

export class CiCdPipeline {
  constructor({ cwd = process.cwd(), steps = DEFAULT_PIPELINE, env } = {}) {
    this.cwd = cwd;
    this.steps = steps;
    this.env = env;
  }

  /**
   * Run the full pipeline, stopping at the first failing step.
   */
  async run() {
    const results = [];
    for (const step of this.steps) {
      const r = await runStep(step.cmd, { cwd: this.cwd, env: this.env });
      results.push({ ...r, name: step.name });
      if (!r.ok) {
        log.warn(`Step "${step.name}" failed (exit ${r.code})`);
        return { ok: false, failedAt: step.name, results };
      }
    }
    return { ok: true, results };
  }

  /**
   * Ask the LLM for a fix suggestion when a step fails.
   */
  async suggestFix(failure) {
    const prompt =
      `A CI step failed.\n\nStep: ${failure.cmd}\nExit code: ${failure.code}\n` +
      `--- stdout ---\n${failure.stdout.slice(-2000)}\n` +
      `--- stderr ---\n${failure.stderr.slice(-2000)}\n\n` +
      `Diagnose the root cause and propose a concrete fix (commands or code edits). ` +
      `Keep it under 400 words.`;

    return routeQuery(prompt,
      'You are a senior engineer debugging a CI failure. Be precise and actionable.');
  }

  /**
   * Run the pipeline. If it fails, attach a `fixSuggestion` to the
   * returned object — safer than auto-applying patches.
   */
  async runWithAutofix() {
    const outcome = await this.run();
    if (outcome.ok) return outcome;
    const failed = outcome.results[outcome.results.length - 1];
    try {
      outcome.fixSuggestion = await this.suggestFix(failed);
    } catch (err) {
      outcome.fixSuggestion = `Could not get fix suggestion: ${err.message}`;
    }
    return outcome;
  }
}

export default CiCdPipeline;
