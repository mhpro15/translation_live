import { Session } from './session.js';
import { 
  SUPPORTED_LANGUAGES, 
  DEFAULT_SOURCE_LANG, 
  DEFAULT_TARGET_LANG 
} from './config.js';
import { validateLanguage } from './utils.js';
import { performSTT } from './stt.js';
import { performTranslation, clearSessionCache } from './translation.js';

// Session manager
export const sessions = new Map();

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle session start
    socket.on('session.start', (data, callback) => {
      try {
        const sessionId = socket.id;
        const sourceLang = validateLanguage(data?.sourceLang) || DEFAULT_SOURCE_LANG;
        const targetLang = data?.targetLang ? validateLanguage(data.targetLang) : DEFAULT_TARGET_LANG;

        if (sessions.has(sessionId)) {
          sessions.get(sessionId).cleanup();
        }

        const session = new Session(sessionId, socket, sourceLang);
        session.targetLang = targetLang;
        sessions.set(sessionId, session);

        console.log(`[${sessionId}] session.start: sourceLang=${sourceLang}, targetLang=${targetLang}`);

        if (callback) {
          callback({
            success: true,
            sessionId,
            sourceLang,
            targetLang,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('session.start error:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle audio chunks
    socket.on('audio.chunk', (chunkBuffer, callback) => {
      try {
        const sessionId = socket.id;
        const session = sessions.get(sessionId);

        if (!session) {
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }

        if (!Buffer.isBuffer(chunkBuffer)) {
          chunkBuffer = Buffer.from(chunkBuffer);
        }

        console.log(`[${sessionId}] Received audio chunk: ${chunkBuffer.length} bytes`);

        const added = session.addAudioChunk(chunkBuffer);
        if (!added) {
          if (callback) callback({ success: false, error: 'Chunk rejected: exceeds limits' });
          return;
        }

        // Process batch if ready
        if (session.shouldProcessBatch()) {
          session.isProcessing = true;
          const batch = session.getAudioBatch();
          console.log(`[${sessionId}] Processing audio batch: ${batch.length} bytes`);

          performSTT(batch, session.sourceLang)
            .then(async (sttResult) => {
              // Translate if needed
              let caption = {
                original: sttResult.text,
                translated: sttResult.text,
                sourceLang: session.sourceLang,
                targetLang: session.targetLang,
                isFinal: true,
                sttLatency: sttResult.latency,
                timestamp: new Date().toISOString()
              };

              if (session.targetLang !== 'none' && session.targetLang !== session.sourceLang) {
                const transResult = await performTranslation(
                  sessionId,
                  sttResult.text,
                  session.sourceLang,
                  session.targetLang
                );
                caption.translated = transResult.translated;
                caption.translationLatency = transResult.latency;
              }

              session.captionHistory.push(caption);
              socket.emit('caption.update', caption);
              session.isProcessing = false;
            })
            .catch((error) => {
              console.error(`[${sessionId}] STT processing error:`, error);
              session.isProcessing = false;
              socket.emit('caption.error', { error: error.message });
            });
        }

        if (callback) {
          callback({ success: true, buffered: session.audioBufferDuration.toFixed(2) });
        }
      } catch (error) {
        console.error('audio.chunk error:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle session stop
    socket.on('session.stop', (data, callback) => {
      try {
        const sessionId = socket.id;
        const session = sessions.get(sessionId);

        if (session) {
          session.cleanup();
          clearSessionCache(sessionId);
          sessions.delete(sessionId);
          console.log(`[${sessionId}] session.stop: cleaned up`);
        }

        if (callback) {
          callback({ success: true, timestamp: new Date().toISOString() });
        }
      } catch (error) {
        console.error('session.stop error:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle settings update
    socket.on('settings.update', (data, callback) => {
      try {
        const sessionId = socket.id;
        const session = sessions.get(sessionId);

        if (!session) {
          if (callback) callback({ success: false, error: 'Session not found' });
          return;
        }

        if (data.sourceLang) {
          const validated = validateLanguage(data.sourceLang);
          if (validated) {
            session.sourceLang = validated;
          }
        }

        if (data.targetLang) {
          const validated = validateLanguage(data.targetLang);
          session.targetLang = validated || 'none';
        }

        console.log(`[${sessionId}] Settings updated: sourceLang=${session.sourceLang}, targetLang=${session.targetLang}`);

        if (callback) {
          callback({
            success: true,
            sourceLang: session.sourceLang,
            targetLang: session.targetLang
          });
        }
      } catch (error) {
        console.error('settings.update error:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const sessionId = socket.id;
      const session = sessions.get(sessionId);

      if (session) {
        session.cleanup();
        clearSessionCache(sessionId);
        sessions.delete(sessionId);
      }

      console.log('Client disconnected:', sessionId);
    });
  });
}
