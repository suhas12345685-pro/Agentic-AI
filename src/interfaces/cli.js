/**
 * CLI Interface
 * Interactive terminal interface for JARVIS.
 */

import { createInterface } from 'readline';
import { createLogger } from '../utils/logger.js';

const log = createLogger('interface:cli');

export class CLIInterface {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.rl = null;
  }

  /**
   * Start the interactive CLI loop.
   */
  start() {
    log.info('Starting CLI interface');

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║        JARVIS — Online and Ready         ║');
    console.log('║  "At your service, Sir."                 ║');
    console.log('║  Type "exit" to quit.                    ║');
    console.log('╚══════════════════════════════════════════╝\n');

    this._prompt();
  }

  _prompt() {
    this.rl.question('You: ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this._prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\nJARVIS: Shutting down systems. Until next time, Sir.\n');
        this.rl.close();
        process.exit(0);
      }

      try {
        const response = await this.orchestrator.process(trimmed);
        console.log(`\nJARVIS: ${response}\n`);
      } catch (err) {
        log.error(`CLI processing error: ${err.message}`);
        console.log('\nJARVIS: I encountered a system error. My apologies, Sir.\n');
      }

      this._prompt();
    });
  }

  /**
   * Stop the CLI interface.
   */
  stop() {
    if (this.rl) {
      this.rl.close();
    }
  }
}
