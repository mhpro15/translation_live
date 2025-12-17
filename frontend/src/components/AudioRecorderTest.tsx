"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RecorderStatus = "idle" | "requesting" | "recording" | "stopped";

function pickSupportedMimeType(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof MediaRecorder === "undefined") return undefined;

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return undefined;
}

export function AudioRecorderTest() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(
    null
  );

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const canUseMediaRecorder = useMemo(() => {
    return (
      typeof window !== "undefined" && typeof MediaRecorder !== "undefined"
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;

      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
      streamRef.current = null;

      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracks = () => {
    if (!streamRef.current) return;
    for (const track of streamRef.current.getTracks()) track.stop();
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = () => {
    clearTimer();
    startAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      if (!startAtRef.current) return;
      setElapsedMs(Date.now() - startAtRef.current);
    }, 200);
  };

  const handleStart = async () => {
    setError(null);

    if (!canUseMediaRecorder) {
      setError("This browser does not support MediaRecorder.");
      return;
    }

    if (status === "recording" || status === "requesting") return;

    // Clear previous recording
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setRecordingMimeType(null);

    setStatus("requesting");

    try {
      // Per Media Capture and Streams, getUserMedia prompts for permission and returns a MediaStream.
      // Use common audio constraints; the UA may ignore them if not satisfiable.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recorderRef.current = recorder;
      setRecordingMimeType(recorder.mimeType || mimeType || null);

      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onerror = () => {
        setError("Recorder error occurred.");
      };

      recorder.onstop = () => {
        clearTimer();

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setStatus("stopped");

        stopTracks();
      };

      recorder.start(250); // gather chunks ~4x/sec
      startTimer();
      setStatus("recording");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to access microphone.";
      setError(msg);
      stopTracks();
      setStatus("idle");
    }
  };

  const handleStop = () => {
    setError(null);

    if (status !== "recording") return;

    try {
      recorderRef.current?.stop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to stop recording.";
      setError(msg);
      clearTimer();
      stopTracks();
      setStatus("idle");
    }
  };

  const mmss = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [elapsedMs]);

  return (
    <div className="p-6 rounded-lg bg-slate-700/30 border border-slate-600">
      <h2 className="text-lg font-semibold mb-2">
        Audio Test (Record + Playback)
      </h2>
      <p className="text-sm text-slate-300 mb-4">
        Uses <code>navigator.mediaDevices.getUserMedia</code> +{" "}
        <code>MediaRecorder</code> to capture microphone audio and play it back
        locally.
      </p>

      {!canUseMediaRecorder && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700 text-red-200 text-sm">
          MediaRecorder is not available in this browser. Try a Chromium-based
          browser.
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleStart}
          disabled={
            !canUseMediaRecorder ||
            status === "requesting" ||
            status === "recording"
          }
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:opacity-50 rounded font-medium transition"
        >
          {status === "requesting" ? "Requesting mic…" : "Start recording"}
        </button>

        <button
          onClick={handleStop}
          disabled={status !== "recording"}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:opacity-50 rounded font-medium transition"
        >
          Stop
        </button>

        <div className="text-sm text-slate-300">
          Status: <span className="font-medium text-white">{status}</span>
          {status === "recording" && (
            <span className="ml-3">Elapsed: {mmss}</span>
          )}
        </div>
      </div>

      {recordingMimeType && (
        <div className="text-xs text-slate-400 mb-3">
          Recorded as: {recordingMimeType}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700 text-red-200 text-sm">
          {error}
        </div>
      )}

      {recordingUrl ? (
        <div className="space-y-3">
          <audio controls src={recordingUrl} className="w-full" />
          <a
            className="text-sm text-slate-200 underline"
            href={recordingUrl}
            download={"mic-test"}
          >
            Download recording
          </a>
        </div>
      ) : (
        <div className="text-sm text-slate-400">
          Record a short clip, then use the player to confirm mic audio works.
        </div>
      )}

      <div className="mt-4 text-xs text-slate-400">
        Note: Microphone capture requires user permission and typically a secure
        context (HTTPS), but <code>http://localhost</code> is allowed.
      </div>
    </div>
  );
}
