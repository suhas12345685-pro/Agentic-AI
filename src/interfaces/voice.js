/**
 * Voice Interface — Phase 3 Awareness
 *
 * Real streaming architecture:
 *   microphone (PCM) ──► TranscriberHook ──► WorkingMemory ──► Orchestrator
 *                                        │
 *                                        └──► 'transcript' events
 *
 * This module intentionally does NOT bundle any one STT vendor. Instead it
 * exposes a small, well-typed hook surface (`attachTranscriber`) so that
 * Deepgram (WebSocket), Whisper (chunked HTTP) or a local Vosk engine can
 * be plugged in without changing the capture pipeline.
 *
 * Audio capture strategy:
 *   • Preferred: the `mic` npm module (arecord/sox under the hood).
 *   • Fallback:  raw 16-bit PCM on stdin (e.g. `sox -d -r 16000 -c 1 -b 16 -t raw -`).
 *   Both produce a plain Node.js Readable of Int16 mono PCM @ 16 kHz.
 */

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('interface:voice');

const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const FRAME_MS = 20; // 20 ms frames → 320 samples → 640 bytes

/* ------------------------------------------------------------------ *
 * Audio capture
 * ------------------------------------------------------------------ */

/**
 * Try to construct a microphone stream using the optional `mic` module.
 * Returns null if the dependency is unavailable — caller falls back to stdin.
 */
async function createMicStream() {
  try {
    const { default: mic } = await import('mic');
    const instance = mic({
      rate: String(SAMPLE_RATE),
      channels: String(CHANNELS),
      bitwidth: String(BIT_DEPTH),
      encoding: 'signed-integer',
      endian: 'little',
      debug: false,
    });
    const stream = instance.getAudioStream();

    stream.on('error', (err) => log.error(`Mic stream error: ${err.message}`));
    instance.start();

    // Attach a stopper so callers can tear this down symmetrically.
    stream.__stop = () => {
      try { instance.stop(); } catch (err) { log.warn(`Mic stop failed: ${err.message}`); }
    };
    return stream;
  } catch (err) {
    log.warn(`'mic' module unavailable (${err.code ?? err.message}); falling back to stdin PCM`);
    return null;
  }
}

/**
 * Treat process.stdin as raw 16-bit PCM. Useful for pipelines like:
 *   sox -d -r 16000 -c 1 -b 16 -t raw - | node index.js --mode voice
 */
function createStdinStream() {
  if (process.stdin.isTTY) {
    log.error('stdin is a TTY — pipe raw PCM audio into the process to use stdin capture');
    return null;
  }
  const s = process.stdin;
  s.__stop = () => { try { s.pause(); } catch { /* ignore */ } };
  return s;
}

/* ------------------------------------------------------------------ *
 * Frame chunking
 * ------------------------------------------------------------------ */

/**
 * Normalize an arbitrary PCM readable into fixed-size frames.
 * Downstream transcribers hate variable-size packets.
 */
function framer(source, frameBytes) {
  let carry = Buffer.alloc(0);
  return new Readable({
    read() { /* pushed reactively below */ },
    objectMode: false,
    construct(cb) {
      source.on('data', (chunk) => {
        carry = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
        while (carry.length >= frameBytes) {
          this.push(carry.subarray(0, frameBytes));
          carry = carry.subarray(frameBytes);
        }
      });
      source.on('end', () => {
        if (carry.length > 0) this.push(carry);
        this.push(null);
      });
      source.on('error', (err) => this.destroy(err));
      cb();
    },
  });
}

/* ------------------------------------------------------------------ *
 * Voice interface
 * ------------------------------------------------------------------ */

export class VoiceInterface extends EventEmitter {
  /**
   * @param {object} orchestrator - Must expose `process(text)`.
   * @param {object} [opts]
   * @param {object} [opts.memory] - Working memory with `addTurn(role, content)`.
   */
  constructor(orchestrator, { memory } = {}) {
    super();
    if (!orchestrator || typeof orchestrator.process !== 'function') {
      throw new TypeError('VoiceInterface requires an orchestrator with process()');
    }
    this.orchestrator = orchestrator;
    this.memory = memory;

    this.active = false;
    this._audioStream = null;
    this._frameStream = null;
    this._transcriber = null;  // current attached transcriber hook
    this._partialTranscript = '';
  }

  /**
   * Plug in a transcriber. The hook must expose:
   *   { write(frame: Buffer), close(), on('transcript', ({ text, isFinal }) => …) }
   * This is the integration point for Deepgram's WS client, Whisper's HTTP
   * streaming, or any other STT backend.
   *
   * @param {EventEmitter & { write: Function, close: Function }} transcriber
   */
  attachTranscriber(transcriber) {
    if (!transcriber || typeof transcriber.write !== 'function' || typeof transcriber.close !== 'function') {
      throw new TypeError('attachTranscriber: transcriber must implement write() and close()');
    }
    this._transcriber = transcriber;

    transcriber.on('transcript', (payload) => this._handleTranscript(payload));
    transcriber.on('error', (err) => log.error(`Transcriber error: ${err.message}`));
    transcriber.on('close', () => log.info('Transcriber closed'));
  }

  /** Start audio capture and wire it into the attached transcriber. */
  async start() {
    if (this.active) {
      log.warn('VoiceInterface.start() called while already active');
      return;
    }

    if (!this._transcriber) {
      log.warn('No transcriber attached — set one via attachTranscriber() before start()');
      log.warn('Voice pipeline will still capture audio but produce no text until attached.');
    }

    this._audioStream = (await createMicStream()) ?? createStdinStream();
    if (!this._audioStream) {
      log.error('No audio source available; voice interface cannot start');
      return;
    }

    const frameBytes = (SAMPLE_RATE * (BIT_DEPTH / 8) * CHANNELS * FRAME_MS) / 1000;
    this._frameStream = framer(this._audioStream, frameBytes);

    this._frameStream.on('data', (frame) => {
      if (!this._transcriber) return;
      try {
        this._transcriber.write(frame);
      } catch (err) {
        log.error(`Frame forward failed: ${err.message}`);
      }
    });
    this._frameStream.on('error', (err) => log.error(`Frame stream error: ${err.message}`));
    this._frameStream.on('end', () => log.info('Audio frame stream ended'));

    this.active = true;
    this.emit('start');
    log.info(`Voice interface active — capturing ${SAMPLE_RATE} Hz / ${BIT_DEPTH}-bit PCM`);
  }

  /**
   * Handle a transcript event coming from the STT hook.
   * Partial transcripts are buffered; finals are piped into working memory
   * and dispatched to the orchestrator.
   */
  async _handleTranscript({ text, isFinal }) {
    if (typeof text !== 'string' || text.trim().length === 0) return;

    if (!isFinal) {
      this._partialTranscript = text;
      this.emit('partial', text);
      return;
    }

    this._partialTranscript = '';
    log.info(`Transcript (final): "${text.slice(0, 80)}"`);

    // Pipe directly into working memory as a user turn.
    if (this.memory && typeof this.memory.addTurn === 'function') {
      try {
        this.memory.addTurn('user', text);
      } catch (err) {
        log.error(`Working memory write failed: ${err.message}`);
      }
    }
    this.emit('transcript', text);

    // Dispatch to the orchestrator. Errors are surfaced as events rather
    // than crashing the capture loop.
    try {
      const reply = await this.orchestrator.process(text);
      this.emit('reply', reply);
    } catch (err) {
      log.error(`Orchestrator dispatch failed: ${err.message}`);
      this.emit('error', err);
    }
  }

  /** Stop capture and release all resources. */
  async stop() {
    if (!this.active) return;
    this.active = false;

    try { this._audioStream?.__stop?.(); } catch (err) { log.warn(`audio stop: ${err.message}`); }
    try { this._frameStream?.destroy(); } catch (err) { log.warn(`frame stop: ${err.message}`); }
    try { await this._transcriber?.close?.(); } catch (err) { log.warn(`transcriber close: ${err.message}`); }

    this._audioStream = null;
    this._frameStream = null;
    this.emit('stop');
    log.info('Voice interface stopped');
  }

  /** Diagnostic / status probe. */
  status() {
    return {
      active: this.active,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitDepth: BIT_DEPTH,
      frameMs: FRAME_MS,
      transcriber: this._transcriber ? 'attached' : 'none',
      deepgramConfigured: Boolean(config.skills.deepgramApiKey),
      elevenLabsConfigured: Boolean(config.skills.elevenlabsApiKey),
    };
  }
}

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

// Exposed for transcriber implementations and unit tests.
export const AUDIO_SPEC = Object.freeze({
  sampleRate: SAMPLE_RATE,
  channels: CHANNELS,
  bitDepth: BIT_DEPTH,
  frameMs: FRAME_MS,
});
