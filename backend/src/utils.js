import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "./config.js";

// Convert PCM (Int16) buffer to WAV format
export function pcmToWav(pcmBuffer, sampleRate = 16000, channels = 1) {
  // Ensure pcmBuffer is a Buffer
  if (!Buffer.isBuffer(pcmBuffer)) {
    throw new Error("pcmBuffer must be a Buffer");
  }

  const byteRate = sampleRate * channels * 2; // 16-bit = 2 bytes per sample
  const blockAlign = channels * 2;
  const subchunk1Size = 16; // PCM format size
  const audioDataSize = pcmBuffer.length;

  // Total file size = 36 + subchunk2size
  // RIFF_HEADER (12) + fmt_SUBCHUNK (24) + data_SUBCHUNK_HEADER (8) + audio_data
  const fileSize = 36 + 8 + audioDataSize;

  const wavBuffer = Buffer.alloc(44 + audioDataSize);
  let offset = 0;

  // RIFF Header
  wavBuffer.write("RIFF", offset, "ascii");
  offset += 4;
  wavBuffer.writeUInt32LE(fileSize, offset); // File size - 8
  offset += 4;
  wavBuffer.write("WAVE", offset, "ascii");
  offset += 4;

  // fmt subchunk
  wavBuffer.write("fmt ", offset, "ascii");
  offset += 4;
  wavBuffer.writeUInt32LE(subchunk1Size, offset); // Subchunk1 size
  offset += 4;
  wavBuffer.writeUInt16LE(1, offset); // Audio format (1 = PCM)
  offset += 2;
  wavBuffer.writeUInt16LE(channels, offset); // Number of channels
  offset += 2;
  wavBuffer.writeUInt32LE(sampleRate, offset); // Sample rate
  offset += 4;
  wavBuffer.writeUInt32LE(byteRate, offset); // Byte rate
  offset += 4;
  wavBuffer.writeUInt16LE(blockAlign, offset); // Block align
  offset += 2;
  wavBuffer.writeUInt16LE(16, offset); // Bits per sample
  offset += 2;

  // data subchunk
  wavBuffer.write("data", offset, "ascii");
  offset += 4;
  wavBuffer.writeUInt32LE(audioDataSize, offset); // Subchunk2 size
  offset += 4;

  // Copy audio data
  pcmBuffer.copy(wavBuffer, offset);

  return wavBuffer;
}

// Validate and normalize language code
export function validateLanguage(langCode) {
  const normalized = langCode ? langCode.toLowerCase() : null;
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : null;
}

// Get language name from code
export function getLanguageName(langCode) {
  return LANGUAGE_NAMES[langCode] || langCode;
}
