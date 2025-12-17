/**
 * Audio encoding utilities
 * Converts between different audio formats
 */

/**
 * Convert Float32 audio samples to Int16 PCM
 * Float32 is in range [-1.0, 1.0]
 * Int16 is in range [-32768, 32767]
 */
export function float32ToInt16(float32Samples: Float32Array): Int16Array {
  const int16Samples = new Int16Array(float32Samples.length);
  
  for (let i = 0; i < float32Samples.length; i++) {
    // Clamp to [-1.0, 1.0]
    let sample = Math.max(-1, Math.min(1, float32Samples[i]));
    // Convert to int16
    int16Samples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  
  return int16Samples;
}

/**
 * Convert Int16 PCM to Float32
 * Useful for debugging/monitoring
 */
export function int16ToFloat32(int16Samples: Int16Array): Float32Array {
  const float32Samples = new Float32Array(int16Samples.length);
  
  for (let i = 0; i < int16Samples.length; i++) {
    float32Samples[i] = int16Samples[i] / 0x8000;
  }
  
  return float32Samples;
}

/**
 * Create a WAV file header
 * Returns a Uint8Array containing the WAV header
 */
export function createWavHeader(
  audioLength: number,
  sampleRate: number = 16000,
  channels: number = 1,
  bitsPerSample: number = 16
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length
  view.setUint32(4, 36 + audioLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Subchunk1 ID
  writeString(view, 12, 'fmt ');
  // Subchunk1 length
  view.setUint32(16, 16, true);
  // Audio format (PCM)
  view.setUint16(20, 1, true);
  // Number of channels
  view.setUint16(22, channels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate
  view.setUint32(28, byteRate, true);
  // Block align
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // Subchunk2 ID
  writeString(view, 36, 'data');
  // Subchunk2 length
  view.setUint32(40, audioLength, true);

  return new Uint8Array(header);
}

/**
 * Combine WAV header with audio data
 */
export function createWavBlob(
  audioData: Int16Array,
  sampleRate: number = 16000,
  channels: number = 1
): Blob {
  const audioBytes = new Uint8Array(audioData.buffer);
  const header = createWavHeader(audioBytes.length, sampleRate, channels);
  
  return new Blob([header, audioBytes], { type: 'audio/wav' });
}

/**
 * Helper to write string to DataView
 */
function writeString(
  view: DataView,
  offset: number,
  string: string
): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
