/**
 * Telegram Interface
 * Handles Telegram bot messages and routes them through the orchestrator.
 */

import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('interface:telegram');

export class TelegramInterface {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.bot = null;
  }

  /**
   * Start the Telegram bot.
   */
  async start() {
    if (!config.telegram.botToken) {
      log.warn('No TELEGRAM_BOT_TOKEN configured. Telegram interface disabled.');
      return;
    }

    try {
      const TelegramBot = (await import('node-telegram-bot-api')).default;
      this.bot = new TelegramBot(config.telegram.botToken, { polling: true });

      this.bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text) return;

        log.info(`Telegram message from ${msg.from?.username || chatId}: ${text.slice(0, 80)}`);

        try {
          const response = await this.orchestrator.process(text);
          await this.bot.sendMessage(chatId, response);
        } catch (err) {
          log.error(`Telegram processing error: ${err.message}`);
          await this.bot.sendMessage(chatId, 'I encountered an error processing your request, Sir.');
        }
      });

      log.info('Telegram bot started (polling)');
    } catch (err) {
      log.error(`Failed to start Telegram bot: ${err.message}`);
    }
  }

  /**
   * Stop the Telegram bot.
   */
  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      log.info('Telegram bot stopped');
    }
  }
}
