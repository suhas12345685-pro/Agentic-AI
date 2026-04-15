/**
 * Proactive Cron Skill
 * Thin wrapper over `node-cron` that lets JARVIS run scheduled
 * autonomous tasks. Each job carries a task string that gets routed
 * through the orchestrator when it fires.
 *
 * Persistence of job definitions lives in the Gateway DB; this module
 * handles the runtime scheduling side.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:cron');

export class ProactiveCron {
  /**
   * @param {{ orchestrator?: object, onTick?: (job) => Promise<void> }} deps
   */
  constructor({ orchestrator, onTick } = {}) {
    this.orchestrator = orchestrator;
    this.onTick = onTick;
    this.jobs = new Map(); // id → { expression, task, handle, runs }
    this.cron = null;
  }

  async _ensureCron() {
    if (this.cron) return this.cron;
    const mod = await import('node-cron');
    this.cron = mod.default ?? mod;
    return this.cron;
  }

  async schedule(id, expression, task) {
    const cron = await this._ensureCron();
    if (!cron.validate(expression)) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }
    if (this.jobs.has(id)) this.cancel(id);

    const handle = cron.schedule(expression, async () => {
      const record = this.jobs.get(id);
      if (!record) return;
      record.runs += 1;
      record.lastRunAt = Date.now();
      log.info(`Cron tick: ${id} → ${task.slice(0, 60)}`);

      try {
        if (this.onTick) {
          await this.onTick({ id, expression, task });
        } else if (this.orchestrator?.process) {
          const reply = await this.orchestrator.process(task);
          record.lastResult = String(reply).slice(0, 300);
        }
      } catch (err) {
        log.error(`Cron job ${id} failed: ${err.message}`);
        record.lastError = err.message;
      }
    });

    this.jobs.set(id, { expression, task, handle, runs: 0 });
    log.info(`Scheduled job ${id} (${expression})`);
    return { id, expression, task };
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    try { job.handle.stop(); } catch { /* ignore */ }
    this.jobs.delete(id);
    log.info(`Cancelled job ${id}`);
    return true;
  }

  list() {
    return [...this.jobs.entries()].map(([id, j]) => ({
      id,
      expression: j.expression,
      task: j.task,
      runs: j.runs,
      lastRunAt: j.lastRunAt ?? null,
      lastResult: j.lastResult ?? null,
      lastError: j.lastError ?? null,
    }));
  }

  stopAll() {
    for (const id of this.jobs.keys()) this.cancel(id);
  }
}

export default ProactiveCron;
