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

    // Create a simple processor using ScriptProcessorNode as fallback.
    // Note: ScriptProcessorNode is deprecated but still widely supported.
    const bufferSize = Math.pow(
      2,
      Math.ceil(
        Math.log2((this.audioContext.sampleRate || this.config.sampleRate) / 10)
      )
    ); // ~100ms buffer

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

    let pending = new Float32Array(chunkSamples * 2);
    let pendingLength = 0;

    const appendSamples = (samples: Float32Array) => {
      if (pendingLength + samples.length > pending.length) {
        const next = new Float32Array(
          Math.max(pending.length * 2, pendingLength + samples.length)
        );
        next.set(pending.subarray(0, pendingLength), 0);
        pending = next;
      }
      pending.set(samples, pendingLength);
      pendingLength += samples.length;
    };

    const emitChunksIfReady = () => {
      while (pendingLength >= chunkSamples) {
        const chunk = pending.slice(0, chunkSamples);
        this.chunkCallbacks.forEach((callback) => callback(chunk));
        pending.copyWithin(0, chunkSamples, pendingLength);
        pendingLength -= chunkSamples;
      }
    };

    const resampleToTarget = (inputData: Float32Array): Float32Array => {
      if (!inputSampleRate || inputSampleRate === targetSampleRate)
        return inputData;

      const ratio = inputSampleRate / targetSampleRate;
      const outputLength = Math.floor(inputData.length / ratio);
      if (outputLength <= 0) return new Float32Array(0);

      // Simple downsampling with block averaging to reduce aliasing.
      const output = new Float32Array(outputLength);
      for (let i = 0; i < outputLength; i++) {
        const start = i * ratio;
        const end = start + ratio;
        const startIndex = Math.floor(start);
        const endIndex = Math.min(Math.floor(end), inputData.length - 1);

        let sum = 0;
        let count = 0;
        for (let j = startIndex; j <= endIndex; j++) {
          sum += inputData[j];
          count++;
        }
        output[i] = count ? sum / count : 0;
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
