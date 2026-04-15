/**
 * Self-Healing Watchdog
 * Periodically inspects subsystems (Ollama, memory tiers, skill
 * executor) and tries to recover failed ones. Emits events on
 * state transitions so the Gateway can surface them.
 */

import { EventEmitter } from 'node:events';
import axios from 'axios';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:self-healing');

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_FAILURE_THRESHOLD = 3;

export class Watchdog extends EventEmitter {
  /**
   * @param {{ memory?: object, intervalMs?: number }} deps
   */
  constructor({ memory, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    super();
    this.memory = memory;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.state = new Map(); // subsystem → { healthy, failures }
    this.probes = new Map();
    this._registerDefaultProbes();
  }

  _registerDefaultProbes() {
    this.registerProbe('ollama', async () => {
      const res = await axios.get(`${config.ollama.baseUrl}/api/tags`, { timeout: 3000 });
      return Array.isArray(res.data?.models);
    });

    this.registerProbe('episodic', async () => {
      if (!this.memory?.episodic?.db) return false;
      try {
        this.memory.episodic.db.prepare('SELECT 1').get();
        return true;
      } catch { return false; }
    });

    this.registerProbe('semantic', async () => {
      return Boolean(this.memory?.semantic?.initialized);
    });
  }

  registerProbe(name, fn, recover) {
    this.probes.set(name, { fn, recover });
    this.state.set(name, { healthy: true, failures: 0, lastCheck: 0 });
  }

  start() {
    if (this.timer) return;
    log.info(`Watchdog started (interval ${this.intervalMs}ms)`);
    this.timer = setInterval(() => this.tick().catch(err => log.error(err.message)), this.intervalMs);
    // fire one immediate check
    this.tick().catch(err => log.error(err.message));
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    log.info('Watchdog stopped');
  }

  async tick() {
    for (const [name, { fn, recover }] of this.probes) {
      const prev = this.state.get(name);
      let healthy = false;
      try { healthy = Boolean(await fn()); } catch { healthy = false; }

      if (healthy) {
        if (!prev.healthy) {
          log.info(`Subsystem ${name} recovered`);
          this.emit('recovered', { name, ...prev });
        }
        this.state.set(name, { healthy: true, failures: 0, lastCheck: Date.now() });
        continue;
      }

      const failures = prev.failures + 1;
      this.state.set(name, { healthy: false, failures, lastCheck: Date.now() });

      if (prev.healthy) {
        log.warn(`Subsystem ${name} degraded`);
        this.emit('degraded', { name, failures });
      }

      if (failures >= DEFAULT_FAILURE_THRESHOLD && recover) {
        log.warn(`Attempting recovery: ${name}`);
        try {
          await recover();
          this.emit('recovery-attempt', { name, ok: true });
        } catch (err) {
          log.error(`Recovery failed for ${name}: ${err.message}`);
          this.emit('recovery-attempt', { name, ok: false, error: err.message });
        }
      }
    }
    this.emit('tick', this.snapshot());
  }

  snapshot() {
    return Object.fromEntries(
      [...this.state.entries()].map(([k, v]) => [k, { ...v }]),
    );
  }
}

export default Watchdog;
