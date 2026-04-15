/**
 * Screen Vision Skill
 * Captures the current screen, encodes it as base64, and asks a
 * multimodal LLM (LLaVA via Ollama by default) to describe it.
 */

import axios from 'axios';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:screen-vision');

const DEFAULT_MODEL = 'llava';

/**
 * Capture the current screen. Returns a Buffer (PNG) or null on failure.
 */
export async function captureScreen() {
  try {
    const screenshot = (await import('screenshot-desktop')).default;
    const buffer = await screenshot({ format: 'png' });
    log.info(`Captured screen: ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    log.error(`Screen capture failed: ${err.message}`);
    return null;
  }
}

/**
 * Ask a multimodal model (Ollama /api/generate with images) about the
 * given image buffer.
 */
export async function describeImage(imageBuffer, prompt = 'Describe what you see.', { model = DEFAULT_MODEL } = {}) {
  if (!imageBuffer) throw new Error('describeImage: image buffer is required');
  const b64 = Buffer.isBuffer(imageBuffer) ? imageBuffer.toString('base64') : imageBuffer;

  try {
    const res = await axios.post(
      `${config.ollama.baseUrl}/api/generate`,
      {
        model,
        prompt,
        images: [b64],
        stream: false,
      },
      { timeout: 120000 },
    );
    return res.data?.response ?? '';
  } catch (err) {
    log.error(`LLaVA call failed: ${err.message}`);
    return `Vision backend unavailable: ${err.message}`;
  }
}

/**
 * End-to-end: capture screen + describe.
 */
export async function describeScreen(prompt = 'Describe what is on the screen right now in concise detail.') {
  const buf = await captureScreen();
  if (!buf) return 'I was unable to capture the screen.';
  return describeImage(buf, prompt);
}

export default { captureScreen, describeImage, describeScreen };
