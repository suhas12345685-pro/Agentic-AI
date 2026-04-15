/**
 * System Monitor Skill
 * Reports CPU, memory, uptime, load, and Ollama reachability.
 */

import os from 'node:os';
import axios from 'axios';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:system-monitor');

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

/**
 * Measure CPU utilisation over a short window (default 500ms).
 */
export async function cpuUsagePercent(windowMs = 500) {
  const start = os.cpus().map(c => c.times);
  await new Promise(r => setTimeout(r, windowMs));
  const end = os.cpus().map(c => c.times);

  const deltas = start.map((s, i) => {
    const e = end[i];
    const idle = e.idle - s.idle;
    const total = (e.user + e.nice + e.sys + e.idle + e.irq) - (s.user + s.nice + s.sys + s.idle + s.irq);
    return total === 0 ? 0 : (1 - idle / total) * 100;
  });
  return avg(deltas);
}

export function memoryStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalMB: Math.round(total / 1024 / 1024),
    usedMB: Math.round(used / 1024 / 1024),
    freeMB: Math.round(free / 1024 / 1024),
    percentUsed: Math.round((used / total) * 100),
  };
}

export async function ollamaReachable() {
  try {
    const res = await axios.get(`${config.ollama.baseUrl}/api/tags`, { timeout: 3000 });
    return { ok: true, models: (res.data?.models ?? []).map(m => m.name) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function snapshot() {
  const [cpu, ollama] = await Promise.all([cpuUsagePercent(), ollamaReachable()]);
  return {
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    uptimeSec: Math.round(os.uptime()),
    processUptimeSec: Math.round(process.uptime()),
    loadAvg: os.loadavg(),
    cpuPercent: Math.round(cpu),
    cpuCount: os.cpus().length,
    memory: memoryStats(),
    ollama,
    timestamp: Date.now(),
  };
}

export function formatSnapshot(s) {
  const ollamaLine = s.ollama.ok
    ? `Ollama: online (${s.ollama.models.length} models)`
    : `Ollama: offline (${s.ollama.error})`;
  return [
    `Host: ${s.host} — ${s.platform} (${s.arch})`,
    `Uptime: system ${s.uptimeSec}s, process ${s.processUptimeSec}s`,
    `CPU: ${s.cpuPercent}% across ${s.cpuCount} cores | load ${s.loadAvg.map(n => n.toFixed(2)).join(', ')}`,
    `Memory: ${s.memory.usedMB}/${s.memory.totalMB} MB (${s.memory.percentUsed}%)`,
    ollamaLine,
  ].join('\n');
}

export default { cpuUsagePercent, memoryStats, ollamaReachable, snapshot, formatSnapshot };
