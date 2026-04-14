/**
 * Voice Interface
 * STT → JARVIS Brain → TTS pipeline.
 * Uses Deepgram for speech-to-text and ElevenLabs for text-to-speech.
 */

import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('interface:voice');

export class VoiceInterface {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.active = false;
  }

  /**
   * Start the voice pipeline.
   */
  async start() {
    if (!config.skills.deepgramApiKey || !config.skills.elevenlabsApiKey) {
      log.warn('Voice pipeline requires DEEPGRAM_API_KEY and ELEVENLABS_API_KEY. Disabled.');
      return;
    }

    this.active = true;
    log.info('Voice interface initialized (awaiting audio input)');

    // Voice pipeline implementation:
    // 1. Capture audio from microphone / VB-Audio Cable
    // 2. Send to Deepgram STT API
    // 3. Route transcription through orchestrator
    // 4. Send response to ElevenLabs TTS API
    // 5. Play audio output
    //
    // Full implementation requires platform-specific audio capture
    // which will be completed in Phase 3.
  }

  /**
   * Process a text input through TTS (for testing without microphone).
   */
  async speak(text) {
    if (!config.skills.elevenlabsApiKey) {
      log.warn('ElevenLabs API key not configured');
      return null;
    }

    try {
      const { default: axios } = await import('axios');
      const response = await axios.post(
        'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
        { text, model_id: 'eleven_monolingual_v1' },
        {
          headers: {
            'xi-api-key': config.skills.elevenlabsApiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );
      return response.data;
    } catch (err) {
      log.error(`TTS failed: ${err.message}`);
      return null;
    }
  }

  stop() {
    this.active = false;
    log.info('Voice interface stopped');
  }
}
