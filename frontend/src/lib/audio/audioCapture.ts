/**
 * Audio Capture Module
 *
 * Captures microphone audio and converts it to 16kHz mono PCM format.
 * Emits audio chunks at configurable intervals (default 3 seconds).
 */

type AudioChunk = Float32Array;
type AudioChunkCallback = (chunk: AudioChunk) => void;

export interface AudioCaptureConfig {
  sampleRate?: number; // Target sample rate (default 16000)
  chunkDurationMs?: number; // Chunk duration in ms (default 3000)
}

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioNode | null = null;
  private mediaStream: MediaStream | null = null;
  private isRunning = false;
  private chunkCallbacks: Set<AudioChunkCallback> = new Set();
  private config: Required<AudioCaptureConfig>;
  private inputSampleRate: number | null = null;

  constructor(config: AudioCaptureConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate || 16000,
      chunkDurationMs: config.chunkDurationMs || 3000,
    };
  }

  /**
   * Start capturing audio from the microphone
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("AudioCapture is already running");
      return;
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Create audio context
      const AudioContextCtor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      // Ask for the target sample rate, but browsers may ignore it.
      this.audioContext = new AudioContextCtor({
        sampleRate: this.config.sampleRate,
      });
      this.inputSampleRate = this.audioContext.sampleRate;

      // Create source from media stream
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Add the audio worklet processor
      await this._setupAudioWorklet();

      this.isRunning = true;
    } catch (error) {
      console.error("Failed to start audio capture:", error);
      this.stop();
      throw error;
    }
  }

  /**
   * Stop capturing audio
   */
  stop(): void {
    this.isRunning = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Register a callback to receive audio chunks
   */
  onChunk(callback: AudioChunkCallback): () => void {
    this.chunkCallbacks.add(callback);
    return () => this.chunkCallbacks.delete(callback);
  }

  /**
   * Internal: Setup audio worklet for PCM capture
   */
  private async _setupAudioWorklet(): Promise<void> {
    if (!this.audioContext || !this.mediaStreamSource) {
      throw new Error("Audio context or media stream source not initialized");
    }

    // Use smaller buffer size for lower latency (2048 = ~46ms at 44.1kHz)
    const bufferSize = 2048;

    const scriptProcessor = this.audioContext.createScriptProcessor(
      bufferSize,
      1,
      1
    );

    const targetSampleRate = this.config.sampleRate;
    const inputSampleRate = this.audioContext.sampleRate;
    const chunkSamples = Math.floor(
      (this.config.chunkDurationMs / 1000) * targetSampleRate
    );

    // Pre-allocate buffer to avoid frequent allocations
    const maxPendingSize = chunkSamples * 4; // Allow up to 4x chunk size
    let pending = new Float32Array(maxPendingSize);
    let pendingLength = 0;

    // Pre-calculate resampling ratio
    const needsResampling = inputSampleRate !== targetSampleRate;
    const resampleRatio = needsResampling
      ? inputSampleRate / targetSampleRate
      : 1;

    const appendSamples = (samples: Float32Array) => {
      const spaceNeeded = pendingLength + samples.length;
      if (spaceNeeded > pending.length) {
        // Rare case: expand buffer
        const newSize = Math.max(pending.length * 2, spaceNeeded);
        const next = new Float32Array(newSize);
        next.set(pending.subarray(0, pendingLength), 0);
        pending = next;
        console.warn(`Audio buffer expanded to ${newSize} samples`);
      }
      pending.set(samples, pendingLength);
      pendingLength += samples.length;
    };

    const emitChunksIfReady = () => {
      while (pendingLength >= chunkSamples) {
        // Use subarray instead of slice to avoid copying when possible
        const chunk = new Float32Array(chunkSamples);
        chunk.set(pending.subarray(0, chunkSamples));
        this.chunkCallbacks.forEach((callback) => callback(chunk));

        // Shift remaining data efficiently
        const remaining = pendingLength - chunkSamples;
        if (remaining > 0) {
          pending.copyWithin(0, chunkSamples, pendingLength);
        }
        pendingLength = remaining;
      }
    };

    // Optimized resampling using linear interpolation (faster than block averaging)
    const resampleToTarget = (inputData: Float32Array): Float32Array => {
      if (!needsResampling) return inputData;

      const outputLength = Math.floor(inputData.length / resampleRatio);
      if (outputLength <= 0) return new Float32Array(0);

      const output = new Float32Array(outputLength);

      // Linear interpolation for smooth resampling
      for (let i = 0; i < outputLength; i++) {
        const srcPos = i * resampleRatio;
        const srcIndex = Math.floor(srcPos);
        const fraction = srcPos - srcIndex;

        if (srcIndex + 1 < inputData.length) {
          // Interpolate between two samples
          output[i] =
            inputData[srcIndex] * (1 - fraction) +
            inputData[srcIndex + 1] * fraction;
        } else {
          output[i] = inputData[srcIndex];
        }
      }
      return output;
    };

    scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.isRunning) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const resampled = resampleToTarget(inputData);
      if (resampled.length === 0) return;
      appendSamples(resampled);
      emitChunksIfReady();
    };

    this.mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
    this.workletNode = scriptProcessor;
  }

  /**
   * Convert Float32Array PCM to Int16Array (for transmission)
   */
  static pcmToInt16(pcm: Float32Array): Int16Array {
    const int16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  /**
   * Convert Int16Array to Buffer (for sending over WS)
   */
  static int16ToBuffer(int16: Int16Array): Buffer {
    return Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
  }

  /**
   * Convenience: Float32 PCM to Buffer (used for WS transmission)
   */
  static pcmToBuffer(pcm: Float32Array): Buffer {
    return this.int16ToBuffer(this.pcmToInt16(pcm));
  }

  get isCapturing(): boolean {
    return this.isRunning;
  }

  get sampleRate(): number {
    return this.config.sampleRate;
  }

  get chunkDurationMs(): number {
    return this.config.chunkDurationMs;
  }
}
