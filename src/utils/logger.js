/**
 * JARVIS Logger
 * Centralized logging with module context.
 * Format: [JARVIS][module] message
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function format(level, module, message) {
  const timestamp = new Date().toISOString();
  return `${timestamp} [JARVIS][${module}] ${level.toUpperCase()}: ${message}`;
}

export function createLogger(module) {
  return {
    debug(msg) {
      if (currentLevel <= LOG_LEVELS.debug) {
        console.debug(format('debug', module, msg));
      }
    },
    info(msg) {
      if (currentLevel <= LOG_LEVELS.info) {
        console.info(format('info', module, msg));
      }
    },
    warn(msg) {
      if (currentLevel <= LOG_LEVELS.warn) {
        console.warn(format('warn', module, msg));
      }
    },
    error(msg) {
      if (currentLevel <= LOG_LEVELS.error) {
        console.error(format('error', module, msg));
      }
    }
  };
}
