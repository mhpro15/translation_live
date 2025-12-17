// Configuration and constants for the translation backend

export const SUPPORTED_LANGUAGES = ['en', 'ja', 'es', 'fr', 'ko'];
export const DEFAULT_SOURCE_LANG = 'en';
export const DEFAULT_TARGET_LANG = 'none';
export const LANGUAGE_NAMES = {
  'en': 'English',
  'ja': 'Japanese',
  'es': 'Spanish',
  'fr': 'French',
  'ko': 'Korean'
};

// STT & Translation configuration
export const STT_BATCH_SIZE_SECONDS = 3; // Accumulate 3s of audio before processing
export const MAX_AUDIO_BUFFER_SECONDS = 60; // Max 60s buffered per session
export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CHUNK_SIZE_BYTES = 1024 * 1024; // 1MB max chunk

export const PORT = process.env.PORT || 3001;
