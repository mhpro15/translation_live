/**
 * React hooks for audio capture and streaming
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AudioCapture, type AudioCaptureConfig } from "./audio";
import {
  StreamingClient,
  type CaptionUpdate,
  type SessionConfig,
} from "./socket";

export function useAudioCapture(config?: AudioCaptureConfig) {
  const captureRef = useRef<AudioCapture | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      if (!captureRef.current) {
        captureRef.current = new AudioCapture(config);
      }
      await captureRef.current.start();
      setIsCapturing(true);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start audio capture"
      );
      setIsCapturing(false);
    }
  }, [config]);

  const stop = useCallback(() => {
    if (captureRef.current) {
      captureRef.current.stop();
    }
    setIsCapturing(false);
  }, []);

  const onChunk = useCallback(
    (callback: (chunk: Float32Array) => void) => {
      if (!captureRef.current) {
        captureRef.current = new AudioCapture(config);
      }
      return captureRef.current.onChunk(callback);
    },
    [config]
  );

  useEffect(() => {
    return () => {
      if (captureRef.current && isCapturing) {
        captureRef.current.stop();
      }
    };
  }, [isCapturing]);

  return {
    start,
    stop,
    isCapturing,
    error,
    onChunk,
    capture: captureRef.current,
  };
}

export function useStreamingClient(serverUrl?: string) {
  const clientRef = useRef<StreamingClient | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionUpdate[]>([]);

  // Initialize client on mount
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new StreamingClient(serverUrl);
    }
  }, [serverUrl]);

  const connect = useCallback(async () => {
    try {
      if (clientRef.current) {
        await clientRef.current.connect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const startSession = useCallback(async (config: SessionConfig) => {
    try {
      if (clientRef.current) {
        await clientRef.current.startSession(config);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to start session";
      setError(msg);
      throw err;
    }
  }, []);

  const stopSession = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.stopSession();
    }
  }, []);

  const sendAudioChunk = useCallback((chunk: Uint8Array | Buffer) => {
    if (clientRef.current) {
      clientRef.current.sendAudioChunk(chunk);
    }
  }, []);

  // Set up listeners
  useEffect(() => {
    if (!clientRef.current) return;

    const unsubStatus = clientRef.current.onConnectionStatus((s) => {
      setStatus(s);
    });

    const unsubError = clientRef.current.onError((msg) => {
      setError(msg);
    });

    const unsubCaption = clientRef.current.onCaption((caption) => {
      setCaptions((prev) => {
        // Keep last 100 captions to avoid memory issues
        const updated = [caption, ...prev];
        return updated.slice(0, 100);
      });
    });

    return () => {
      unsubStatus();
      unsubError();
      unsubCaption();
    };
  }, []);

  return {
    status,
    error,
    captions,
    connect,
    disconnect,
    startSession,
    stopSession,
    sendAudioChunk,
    client: clientRef.current,
  };
}
