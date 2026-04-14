/**
 * LLM Router
 * Routes queries to the optimal model based on task classification.
 *
 * Routing logic (zero extra API calls — heuristic classifier):
 *   reasoning  → DeepSeek R1 7B   (default)
 *   code       → DeepSeek Coder   (contains: code, function, debug, error)
 *   quick      → Qwen 2.5 3B      (< 15 words, simple Q&A)
 *   vision     → LLaVA            (screen/image requests)
 *   search     → web_search + LLM (contains: latest, news, today, current)
 *   fallback   → HuggingFace API  (Ollama offline)
 */

import axios from 'axios';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('llm-router');

const CODE_KEYWORDS = ['code', 'function', 'debug', 'error', 'compile', 'syntax', 'program', 'script', 'implement', 'refactor', 'class', 'method', 'variable', 'api endpoint'];
const SEARCH_KEYWORDS = ['latest', 'news', 'today', 'current', 'recent', 'weather', 'stock', 'price'];
const VISION_KEYWORDS = ['screen', 'screenshot', 'image', 'see my', 'look at', 'what do you see', 'describe what'];

const MODELS = {
  reasoning: 'deepseek-r1:7b',
  code: 'deepseek-coder:7b',
  quick: 'qwen2.5:3b',
  vision: 'llava',
};

/**
 * Classify a query into a task type.
 */
export function classifyQuery(query) {
  const lower = query.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  if (VISION_KEYWORDS.some(kw => lower.includes(kw))) return 'vision';
  if (SEARCH_KEYWORDS.some(kw => lower.includes(kw))) return 'search';
  if (CODE_KEYWORDS.some(kw => lower.includes(kw))) return 'code';
  if (wordCount < 15) return 'quick';
  return 'reasoning';
}

/**
 * Call Ollama local model.
 */
async function callOllama(model, prompt, systemPrompt = '') {
  const url = `${config.ollama.baseUrl}/api/generate`;
  log.info(`Calling Ollama model: ${model}`);

  try {
    const response = await axios.post(url, {
      model,
      prompt,
      system: systemPrompt,
      stream: false,
    }, { timeout: 120000 });

    return response.data.response;
  } catch (err) {
    log.error(`Ollama call failed for ${model}: ${err.message}`);
    return null;
  }
}

/**
 * Call HuggingFace Inference API as fallback.
 */
async function callHuggingFace(prompt) {
  if (!config.huggingface.apiKey) {
    log.warn('No HuggingFace API key configured');
    return null;
  }

  log.info('Calling HuggingFace API (fallback)');

  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${config.huggingface.apiKey}` },
        timeout: 60000,
      }
    );

    if (Array.isArray(response.data) && response.data[0]?.generated_text) {
      return response.data[0].generated_text;
    }
    return null;
  } catch (err) {
    log.error(`HuggingFace call failed: ${err.message}`);
    return null;
  }
}

/**
 * Route a query to the best model and return the response.
 */
export async function routeQuery(query, systemPrompt = '') {
  const taskType = classifyQuery(query);
  log.info(`Query classified as: ${taskType}`);

  const model = MODELS[taskType] || MODELS.reasoning;

  // Try Ollama first
  let response = await callOllama(model, query, systemPrompt);

  // Fallback to default model if specialized model fails
  if (!response && model !== MODELS.reasoning) {
    log.warn(`Falling back from ${model} to ${MODELS.reasoning}`);
    response = await callOllama(MODELS.reasoning, query, systemPrompt);
  }

  // Fallback to HuggingFace if Ollama is down
  if (!response) {
    log.warn('Ollama offline, falling back to HuggingFace API');
    response = await callHuggingFace(query);
  }

  if (!response) {
    log.error('All LLM backends failed');
    return 'I apologize, Sir, but all my language model backends appear to be offline. Please check that Ollama is running.';
  }

  return response;
}
