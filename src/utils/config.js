/**
 * JARVIS Configuration
 * Loads environment variables and provides typed config access.
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // LLM
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'deepseek-r1:7b',
  },
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },

  // Memory
  memory: {
    sqlitePath: process.env.SQLITE_DB_PATH || './data/jarvis.db',
    chromaPath: process.env.CHROMA_PATH || './data/chroma',
  },

  // Skills
  skills: {
    braveApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  },

  // Security
  security: {
    allowedDomains: (process.env.ALLOWED_DOMAINS || 'google.com,wikipedia.org,github.com').split(','),
    sandboxDir: process.env.SANDBOX_DIR || './tmp/sandbox',
    planModeEnabled: process.env.PLAN_MODE_ENABLED !== 'false',
  },

  // Gateway
  gateway: {
    port: parseInt(process.env.GATEWAY_PORT || '4747', 10),
  },

  // Personality
  personality: {
    userName: process.env.JARVIS_USER_NAME || 'Sir',
  },
};
