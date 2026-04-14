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

import { config } from './src/utils/config.js';
import { createLogger } from './src/utils/logger.js';
import { Orchestrator } from './src/brain/orchestrator.js';
import { Personality } from './src/personality/wrapper.js';
import { MemoryManager } from './src/memory/index.js';
import { createSkillExecutor } from './src/skills/executor.js';
import { CLIInterface } from './src/interfaces/cli.js';
import { TelegramInterface } from './src/interfaces/telegram.js';

const log = createLogger('core');

async function boot() {
  log.info('=== JARVIS Booting ===');
  log.info(`Mode: ${getMode()}`);

  // Initialize memory system
  const memory = new MemoryManager();
  await memory.init();

  // Initialize personality
  const personality = new Personality();

  // Initialize skill executor
  const skillExecutor = createSkillExecutor();

  // Connect memory to skill executor
  skillExecutor.register('memory_recall', async (query) => {
    const result = await memory.recall(query);
    return result || 'No relevant memories found.';
  });
  skillExecutor.register('memory_store', async (args) => {
    const commaIdx = args.indexOf(',');
    if (commaIdx === -1) return 'Error: memory_store requires key and value separated by comma';
    const key = args.slice(0, commaIdx).trim();
    const value = args.slice(commaIdx + 1).trim();
    await memory.store(key, value);
    return `Stored in memory: ${key}`;
  });

  // Initialize orchestrator
  const orchestrator = new Orchestrator({ memory, skillExecutor, personality });

  // Start the selected interface
  const mode = getMode();

  if (mode === 'telegram') {
    const telegram = new TelegramInterface(orchestrator);
    await telegram.start();
  } else {
    // Default: CLI interface
    const cli = new CLIInterface(orchestrator);
    cli.start();
  }

  log.info('=== JARVIS Online ===');

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutdown signal received');
    memory.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('Termination signal received');
    memory.close();
    process.exit(0);
  });
}

function getMode() {
  const modeIdx = process.argv.indexOf('--mode');
  if (modeIdx !== -1 && process.argv[modeIdx + 1]) {
    return process.argv[modeIdx + 1].toLowerCase();
  }
  return 'cli';
}

boot().catch(err => {
  log.error(`Boot failed: ${err.message}`);
  process.exit(1);
});
