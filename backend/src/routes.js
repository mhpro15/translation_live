import express from 'express';
import { sessions } from './socketHandlers.js';
import { STT_BATCH_SIZE_SECONDS, MAX_AUDIO_BUFFER_SECONDS, INACTIVITY_TIMEOUT_MS, SUPPORTED_LANGUAGES } from './config.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size
  });
});

// Server info endpoint
router.get('/info', (req, res) => {
  res.json({
    name: 'Translation Backend',
    version: '1.0.0',
    config: {
      sttBatchSize: `${STT_BATCH_SIZE_SECONDS}s`,
      maxAudioBuffer: `${MAX_AUDIO_BUFFER_SECONDS}s`,
      inactivityTimeout: `${INACTIVITY_TIMEOUT_MS / 1000}s`,
      supportedLanguages: SUPPORTED_LANGUAGES.map(l => l.toUpperCase())
    }
  });
});

// Sessions list endpoint (debug only, remove in production)
router.get('/sessions', (req, res) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
    id,
    sourceLang: session.sourceLang,
    targetLang: session.targetLang,
    bufferDuration: session.audioBufferDuration.toFixed(2),
    isProcessing: session.isProcessing,
    captionCount: session.captionHistory.length,
    startTime: session.startTime
  }));
  res.json({ activeSessions: sessionList.length, sessions: sessionList });
});

export default router;
