"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAudioCapture, useStreamingClient } from "@/lib/hooks";
import { AudioCapture } from "@/lib/audio";

const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "ko", name: "한국어" },
];

export default function Home() {
  const {
    start: startAudio,
    stop: stopAudio,
    isCapturing,
    onChunk,
  } = useAudioCapture({
    sampleRate: 16000,
    chunkDurationMs: 1500, // Reduced to 1.5s for faster response
  });

  const {
    status: connectionStatus,
    error: streamError,
    captions,
    connect,
    disconnect,
    startSession,
    stopSession,
    sendAudioChunk,
    generateSpeech,
  } = useStreamingClient("http://localhost:3001");

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [localError, setLocalError] = useState<string | null>(null);
  const [speakTranslations, setSpeakTranslations] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const chunkUnsubRef = useRef<(() => void) | null>(null);
  const lastSpokenKeyRef = useRef<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const speakText = useCallback(
    async (text: string, lang?: string) => {
      if (!text || !generateSpeech) return;

      try {
        setIsSpeaking(true);

        // Stop any currently playing audio
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }

        console.log(
          `Generating speech for: ${text.substring(0, 50)}... (lang: ${lang})`
        );

        // Get audio from backend OpenAI TTS
        const audioBuffer = await generateSpeech(text, lang);

        // Create blob and play
        const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        currentAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
          currentAudioRef.current = null;
        };

        audio.onerror = (err) => {
          console.error("Audio playback error:", err);
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
          currentAudioRef.current = null;
        };

        await audio.play();
      } catch (err) {
        console.error("TTS failed:", err);
        setIsSpeaking(false);
      }
    },
    [generateSpeech]
  );

  // Connect to server on mount
  useEffect(() => {
    connect().catch(() => {
      // Retry on error
    });

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Handle audio chunk emission and sending to server
  useEffect(() => {
    if (!isSessionActive || !isCapturing) return;

    chunkUnsubRef.current = onChunk((chunk: Float32Array) => {
      // Convert Float32 PCM to Int16 and send to server
      const buffer = AudioCapture.pcmToBuffer(chunk);
      sendAudioChunk(buffer);
    });

    return () => {
      if (chunkUnsubRef.current) {
        chunkUnsubRef.current();
      }
    };
  }, [isSessionActive, isCapturing, onChunk, sendAudioChunk]);

  // Handle session start
  const handleStartSession = async () => {
    try {
      setLocalError(null);

      // Connect if not already connected
      if (connectionStatus !== "connected") {
        await connect();
      }

      // Start audio capture
      await startAudio();

      // Start streaming session
      await startSession({ sourceLang, targetLang });

      setIsSessionActive(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to start session";
      setLocalError(msg);
      // Rollback
      stopAudio();
    }
  };

  // Handle session stop
  const handleStopSession = async () => {
    try {
      setLocalError(null);
      // Stop any playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      stopAudio();
      await stopSession();
      setIsSessionActive(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop session";
      setLocalError(msg);
    }
  };

  // Speak translated text when a final caption arrives
  useEffect(() => {
    if (!speakTranslations) return;
    if (!captions || captions.length === 0) return;

    const newest = captions[0];
    if (!newest?.isFinal) return;
    if (!newest.translated || newest.translated === newest.original) return;
    if (targetLang === "none") return;

    const key = `${newest.timestamp}|${newest.translated}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    // Defer TTS call to avoid synchronous setState in effect
    const timeoutId = setTimeout(() => {
      // Use targetLang state instead of caption's targetLang for consistency
      const langToUse = targetLang && targetLang !== "none" ? targetLang : "en";
      console.log(
        `Auto TTS: speaking "${newest.translated.substring(
          0,
          30
        )}..." in lang: ${langToUse}`
      );
      speakText(newest.translated, langToUse).catch((err) =>
        console.error("Auto TTS failed:", err)
      );
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [captions, speakTranslations, targetLang, speakText]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const isLoading = connectionStatus === "connecting";
  const canStart = connectionStatus === "connected" && !isSessionActive;
  const canStop = isSessionActive;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Translation Live</h1>
          <p className="text-slate-400">
            Real-time speech transcription and translation
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-3 h-3 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-500"
                  : connectionStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium capitalize">
              {connectionStatus === "connected"
                ? "Connected"
                : connectionStatus === "connecting"
                ? "Connecting"
                : "Disconnected"}
            </span>
          </div>
          {streamError && (
            <div className="text-sm text-red-400 mt-1">
              Error: {streamError}
            </div>
          )}
        </div>

        {/* Settings Panel */}
        <div className="mb-6 p-6 rounded-lg bg-slate-700/30 border border-slate-600">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Language */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Source Language
              </label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                disabled={isSessionActive}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Language */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Language
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                disabled={isSessionActive}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="none">None (Original only)</option>
                {LANGUAGES.filter((l) => l.code !== "auto").map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* TTS */}
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={speakTranslations}
                  onChange={(e) => setSpeakTranslations(e.target.checked)}
                  disabled={targetLang === "none"}
                />
                Speak translated text (TTS)
              </label>
              {targetLang === "none" && (
                <div className="text-xs text-slate-400 mt-1">
                  Enable a target language to use TTS.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={handleStartSession}
            disabled={!canStart || isLoading}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:opacity-50 rounded-lg font-medium transition"
          >
            {isLoading ? "Connecting..." : "Start"}
          </button>
          <button
            onClick={handleStopSession}
            disabled={!canStop}
            className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:opacity-50 rounded-lg font-medium transition"
          >
            Stop
          </button>
        </div>

        {/* Error Display */}
        {localError && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200">
            {localError}
          </div>
        )}

        {/* Status Info */}
        {isSessionActive && (
          <div className="mb-6 p-4 rounded-lg bg-blue-900/30 border border-blue-700 text-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Session active • {isCapturing && "Capturing audio..."}
            </div>
            <div className="text-sm mt-1 text-blue-300">
              Source: {LANGUAGES.find((l) => l.code === sourceLang)?.name} →
              Target:{" "}
              {targetLang === "none"
                ? "None"
                : LANGUAGES.find((l) => l.code === targetLang)?.name}
            </div>
          </div>
        )}

        {/* Captions Display */}
        <div className="p-6 rounded-lg bg-slate-700/30 border border-slate-600">
          <h2 className="text-lg font-semibold mb-4">Live Captions</h2>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {captions.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                {isSessionActive
                  ? "Waiting for captions..."
                  : "Start a session to see live captions"}
              </div>
            ) : (
              captions.map((caption, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    caption.isFinal
                      ? "bg-slate-600/50 border border-slate-500"
                      : "bg-slate-700/50 border border-slate-600 opacity-75"
                  }`}
                >
                  <div className="text-sm text-slate-400 mb-1 flex justify-between items-center">
                    <span>
                      {typeof caption.timestamp === "string"
                        ? new Date(caption.timestamp).toLocaleTimeString()
                        : new Date(caption.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex items-center gap-3">
                      {caption.sttLatency && (
                        <span className="text-xs text-slate-500">
                          STT: {caption.sttLatency}ms
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={isSpeaking}
                        onClick={() => {
                          const hasTranslation =
                            !!caption.translated &&
                            caption.translated !== caption.original;

                          const textToSpeak = hasTranslation
                            ? caption.translated
                            : caption.original;
                          const langToUse = hasTranslation
                            ? caption.targetLang
                            : caption.sourceLang;

                          speakText(textToSpeak, langToUse);
                        }}
                        className="text-xs px-2 py-1 rounded border border-slate-500 bg-slate-700/40 hover:bg-slate-700/70 disabled:opacity-50 disabled:hover:bg-slate-700/40"
                        title={isSpeaking ? "Playing..." : "Play"}
                      >
                        {isSpeaking ? "Playing..." : "Play"}
                      </button>
                    </div>
                  </div>
                  <div className="font-medium text-white">
                    {caption.original}
                  </div>
                  {caption.translated &&
                    caption.translated !== caption.original && (
                      <div className="text-sm text-slate-300 mt-1">
                        <span className="text-blue-400">→ </span>
                        {caption.translated}
                        {caption.translationLatency && (
                          <span className="text-xs text-slate-500 ml-2">
                            Trans: {caption.translationLatency}ms
                          </span>
                        )}
                      </div>
                    )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          <p>
            Target latency: ≤3s end-to-end • Supports EN, JA, ES, FR, KO • Best
            on modern browsers
          </p>
        </div>
      </div>
    </div>
  );
}
