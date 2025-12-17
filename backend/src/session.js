import {
  STT_BATCH_SIZE_SECONDS,
  MAX_AUDIO_BUFFER_SECONDS,
  INACTIVITY_TIMEOUT_MS,
  MAX_CHUNK_SIZE_BYTES,
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
} from "./config.js";

// Session class to manage per-session state
export class Session {
  constructor(sessionId, socket, sourceLang = DEFAULT_SOURCE_LANG) {
    this.sessionId = sessionId;
    this.socket = socket;
    this.sourceLang = sourceLang;
    this.targetLang = DEFAULT_TARGET_LANG;
    this.audioBuffer = Buffer.alloc(0);
    this.audioBufferDuration = 0; // in seconds
    this.isProcessing = false;
    this.lastActivityTime = Date.now();
    this.inactivityTimer = null;
    this.captionHistory = [];
    this.startTime = new Date().toISOString();

    console.log(
      `[${sessionId}] Session created: sourceLang=${sourceLang}, targetLang=${this.targetLang}`
    );
  }

  addAudioChunk(chunkBuffer) {
    // Validate chunk size
    if (chunkBuffer.length > MAX_CHUNK_SIZE_BYTES) {
      console.warn(
        `[${this.sessionId}] Chunk exceeds max size: ${chunkBuffer.length} > ${MAX_CHUNK_SIZE_BYTES}`
      );
      return false;
    }

    // Assume 16kHz mono PCM (16-bit samples = 2 bytes per sample)
    // 16000 samples/sec = 16000 * 2 bytes/sec = 32000 bytes/sec
    const BYTES_PER_SECOND = 16000 * 2;
    const chunkDuration = chunkBuffer.length / BYTES_PER_SECOND;

    this.audioBuffer = Buffer.concat([this.audioBuffer, chunkBuffer]);
    this.audioBufferDuration += chunkDuration;

    // Check if we exceed max buffer
    if (this.audioBufferDuration > MAX_AUDIO_BUFFER_SECONDS) {
      console.warn(
        `[${
          this.sessionId
        }] Audio buffer exceeds max: ${this.audioBufferDuration.toFixed(
          2
        )}s > ${MAX_AUDIO_BUFFER_SECONDS}s`
      );
      return false;
    }

    this.updateActivity();
    return true;
  }

  shouldProcessBatch() {
    if (this.isProcessing) return false;

    // Process immediately if we have enough audio
    const hasEnoughAudio = this.audioBufferDuration >= STT_BATCH_SIZE_SECONDS;

    // Also allow processing if we have some audio and haven't received more in a while
    const hasMinimumAudio = this.audioBufferDuration >= 0.5; // Minimum 500ms
    const timeSinceActivity = (Date.now() - this.lastActivityTime) / 1000;
    const hasStaleAudio = hasMinimumAudio && timeSinceActivity > 2;

    return hasEnoughAudio || hasStaleAudio;
  }

  getAudioBatch() {
    // Get audio for processing (up to STT_BATCH_SIZE_SECONDS)
    const BYTES_PER_SECOND = 16000 * 2;
    const maxBatchBytes = Math.ceil(STT_BATCH_SIZE_SECONDS * BYTES_PER_SECOND);
    const batchLength = Math.min(maxBatchBytes, this.audioBuffer.length);

    // Create a proper Buffer from the batch (not just a subarray)
    const batch = Buffer.from(this.audioBuffer.subarray(0, batchLength));

    // Remove processed audio from buffer
    this.audioBuffer = Buffer.from(this.audioBuffer.subarray(batchLength));
    this.audioBufferDuration -= STT_BATCH_SIZE_SECONDS;
    if (this.audioBufferDuration < 0) this.audioBufferDuration = 0;

    return batch;
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
    this.resetInactivityTimer();
  }

  resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      console.log(`[${this.sessionId}] Inactivity timeout`);
      this.cleanup();
    }, INACTIVITY_TIMEOUT_MS);
  }

  cleanup() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.audioBuffer = Buffer.alloc(0);
    this.audioBufferDuration = 0;
    console.log(`[${this.sessionId}] Session cleaned up`);
  }
}
