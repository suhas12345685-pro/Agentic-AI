/**
 * JARVIS — Entry Point
 * Boots the JARVIS core, loads configuration, and starts the selected interface.
 *
 * Usage:
 *   node index.js                    # Start with CLI (default)
 *   node index.js --mode cli         # Start with CLI
 *   node index.js --mode telegram    # Start with Telegram
 *   node index.js --mode dev         # Start in dev mode (CLI + verbose logging)
 */

import { createLogger } from './src/utils/logger.js';
import { Orchestrator } from './src/brain/orchestrator.js';
import { Personality } from './src/personality/wrapper.js';
import { MemoryManager } from './src/memory/index.js';
import { createSkillExecutor } from './src/skills/executor.js';
import { CLIInterface } from './src/interfaces/cli.js';
import { TelegramInterface } from './src/interfaces/telegram.js';
import { VoiceInterface } from './src/interfaces/voice.js';
import { RagEngine } from './src/skills/rag-engine/index.js';
import { BrowserAuto } from './src/skills/browser-auto/index.js';
import { CiCdPipeline } from './src/skills/cicd-headless/index.js';
import { ProactiveCron } from './src/skills/proactive-cron/index.js';
import { Watchdog } from './src/skills/self-healing/index.js';
import { defaultGuard } from './src/security/index.js';

const log = createLogger('core');

async function boot() {
  const mode = getMode();
  log.info('=== JARVIS Booting ===');
  log.info(`Mode: ${mode}`);

  // ─── Memory ─────────────────────────────────────────────
  const memory = new MemoryManager();
  await memory.init();

  // ─── Personality ────────────────────────────────────────
  const personality = new Personality();

  // ─── Peripheral skills ──────────────────────────────────
  const rag = new RagEngine({ semantic: memory.semantic });
  const browser = new BrowserAuto();         // lazy-launched on first use
  const cicd = new CiCdPipeline();           // operates on cwd by default

  // ─── Skill executor ─────────────────────────────────────
  const skillExecutor = createSkillExecutor({ rag, browser, cicd });

  // Wire memory skills at runtime
  skillExecutor.register('memory_recall', async (query) => {
    const result = await memory.recall(query);
    return result || 'No relevant memories found.';
  });
  skillExecutor.register('memory_store', async (args) => {
    const commaIdx = String(args).indexOf(',');
    if (commaIdx === -1) return 'Error: memory_store requires "key, value"';
    const key = args.slice(0, commaIdx).trim();
    const value = args.slice(commaIdx + 1).trim();
    await memory.store(key, value);
    return `Stored in memory: ${key}`;
  });

  // ─── Orchestrator ───────────────────────────────────────
  const orchestrator = new Orchestrator({
    memory,
    skillExecutor,
    personality,
    security: defaultGuard,
  });

  // ─── Background workers ─────────────────────────────────
  const cron = new ProactiveCron({ orchestrator });
  const watchdog = new Watchdog({ memory });
  watchdog.on('degraded', ({ name }) => log.warn(`[watchdog] ${name} degraded`));
  watchdog.on('recovered', ({ name }) => log.info(`[watchdog] ${name} recovered`));
  watchdog.start();

  // ─── Interface ──────────────────────────────────────────
  if (mode === 'telegram') {
    const telegram = new TelegramInterface(orchestrator);
    await telegram.start();
  } else if (mode === 'voice') {
    const voice = new VoiceInterface(orchestrator, { memory: memory.working });
    voice.on('reply', (reply) => process.stdout.write(`JARVIS: ${reply}\n`));
    await voice.start();
  } else {
    const cli = new CLIInterface(orchestrator);
    cli.start();
  }

  log.info('=== JARVIS Online ===');

  // ─── Shutdown ───────────────────────────────────────────
  const shutdown = async (signal) => {
    log.info(`${signal} received — shutting down`);
    try { watchdog.stop(); } catch { /* ignore */ }
    try { cron.stopAll(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    try { memory.close(); } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function getMode() {
  const idx = process.argv.indexOf('--mode');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].toLowerCase();
  }
  return 'cli';
}

boot().catch((err) => {
  log.error(`Boot failed: ${err.message}`);
  process.exit(1);
});
