/**
 * Voice Pipeline
 * Deepgram STT → LLM → ElevenLabs TTS.
 *
 * Exposes:
 *   transcribe(audioBuffer, { mimetype })   → { transcript }
 *   synthesize(text, { voiceId })           → Buffer (mpeg)
 *   speakReply(audioBuffer, orchestrator)   → { transcript, reply, audio }
 */

import axios from 'axios';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill:voice');

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel, public ElevenLabs sample voice

/**
 * Transcribe an audio buffer with Deepgram.
 */
export async function transcribe(audioBuffer, { mimetype = 'audio/wav', language = 'en' } = {}) {
  if (!config.skills.deepgramApiKey) {
    return { transcript: '', error: 'DEEPGRAM_API_KEY not configured' };
  }
  if (!audioBuffer || !audioBuffer.length) {
    return { transcript: '', error: 'empty audio buffer' };
  }

  try {
    const res = await axios.post(DEEPGRAM_URL, audioBuffer, {
      params: { model: 'nova-2', smart_format: true, language },
      headers: {
        Authorization: `Token ${config.skills.deepgramApiKey}`,
        'Content-Type': mimetype,
      },
      timeout: 60000,
      maxBodyLength: Infinity,
    });
    const transcript = res.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    log.info(`Transcribed ${audioBuffer.length}B → "${transcript.slice(0, 80)}"`);
    return { transcript };
  } catch (err) {
    log.error(`Deepgram STT failed: ${err.message}`);
    return { transcript: '', error: err.message };
  }
}

/**
 * Synthesize speech with ElevenLabs. Returns an mpeg audio Buffer.
 */
export async function synthesize(text, { voiceId = DEFAULT_VOICE, model = 'eleven_monolingual_v1' } = {}) {
  if (!config.skills.elevenlabsApiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }
  if (!text || !text.trim()) throw new Error('synthesize: text is required');

  try {
    const res = await axios.post(
      `${ELEVEN_URL}/${voiceId}`,
      {
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'xi-api-key': config.skills.elevenlabsApiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      },
    );
    log.info(`Synthesized ${text.length} chars → ${res.data.length} bytes`);
    return Buffer.from(res.data);
  } catch (err) {
    log.error(`ElevenLabs TTS failed: ${err.message}`);
    throw err;
  }
}

/**
 * End-to-end: audio in → transcript → orchestrator → reply → audio out.
 */
export async function speakReply(audioBuffer, orchestrator, opts = {}) {
  const { transcript, error } = await transcribe(audioBuffer, opts);
  if (error || !transcript) {
    return { transcript: '', reply: '', audio: null, error: error || 'no transcript' };
  }

  const reply = await orchestrator.process(transcript);

  let audio = null;
  try {
    audio = await synthesize(reply, opts);
  } catch (err) {
    log.warn(`TTS skipped: ${err.message}`);
  }

  return { transcript, reply, audio };
}

export default { transcribe, synthesize, speakReply };
