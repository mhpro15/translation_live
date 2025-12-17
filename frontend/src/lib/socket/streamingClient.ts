/**
 * WebSocket Client for streaming audio and receiving captions
 *
 * Manages persistent connection, reconnection, and message flow.
 */

import { io, Socket } from "socket.io-client";

export interface SessionConfig {
  sourceLang: string;
  targetLang: string;
}

export interface CaptionUpdate {
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
  isFinal: boolean;
  sttLatency?: number;
  translationLatency?: number;
  timestamp: string | number;
}

export interface CaptionError {
  error: string;
}

type MessageCallback<T> = (data: T) => void;

export class StreamingClient {
  private socket: Socket | null = null;
  private serverUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // ms
  private sessionConfig: SessionConfig | null = null;
  private isConnected = false;
  private captionCallbacks: Set<MessageCallback<CaptionUpdate>> = new Set();
  private errorCallbacks: Set<MessageCallback<string>> = new Set();
  private connectionStatusCallbacks: Set<
    MessageCallback<"connecting" | "connected" | "disconnected">
  > = new Set();

  constructor(serverUrl: string = "http://localhost:3001") {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to the server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
        });

        this.socket.on("connect", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._notifyConnectionStatus("connected");
          resolve();
        });

        this.socket.on("disconnect", () => {
          this.isConnected = false;
          this._notifyConnectionStatus("disconnected");
        });

        this.socket.on("caption.update", (data: CaptionUpdate) => {
          this.captionCallbacks.forEach((cb) => cb(data));
        });

        this.socket.on("caption.error", (data: CaptionError) => {
          this.errorCallbacks.forEach((cb) => cb(data.error));
        });

        this.socket.on("error", (error: string) => {
          this.errorCallbacks.forEach((cb) => cb(error));
        });

        this.socket.on("connect_error", (error: Error) => {
          this.errorCallbacks.forEach((cb) => cb(error.message));
        });

        this._notifyConnectionStatus("connecting");
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.sessionConfig = null;
  }

  /**
   * Start a live transcription session
   */
  async startSession(config: SessionConfig): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error("Not connected to server");
    }

    this.sessionConfig = config;

    return new Promise((resolve, reject) => {
      this.socket?.emit("session.start", config, (response: any) => {
        if (!response?.success) {
          reject(new Error(response?.error || "Failed to start session"));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Stop the current session
   */
  async stopSession(): Promise<void> {
    if (!this.isConnected || !this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket?.emit("session.stop", {}, () => {
        this.sessionConfig = null;
        resolve();
      });
    });
  }

  /**
   * Send an audio chunk to the server
   */
  sendAudioChunk(chunk: Int16Array | Uint8Array | Buffer): void {
    if (!this.isConnected || !this.socket) {
      console.warn("Not connected; audio chunk dropped");
      return;
    }

    // Convert Int16Array to Buffer if needed for binary transmission
    let binaryData: Buffer | Uint8Array;
    if (chunk instanceof Int16Array) {
      binaryData = Buffer.from(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength
      );
    } else {
      binaryData = chunk;
    }

    this.socket.emit("audio.chunk", binaryData);
  }

  /**
   * Register a callback for caption updates
   */
  onCaption(callback: MessageCallback<CaptionUpdate>): () => void {
    this.captionCallbacks.add(callback);
    return () => this.captionCallbacks.delete(callback);
  }

  /**
   * Register a callback for errors
   */
  onError(callback: MessageCallback<string>): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /**
   * Register a callback for connection status changes
   */
  onConnectionStatus(
    callback: MessageCallback<"connecting" | "connected" | "disconnected">
  ): () => void {
    this.connectionStatusCallbacks.add(callback);
    return () => this.connectionStatusCallbacks.delete(callback);
  }

  private _notifyConnectionStatus(
    status: "connecting" | "connected" | "disconnected"
  ): void {
    this.connectionStatusCallbacks.forEach((cb) => cb(status));
  }

  getConnectionStatus(): "connecting" | "connected" | "disconnected" {
    return this.isConnected ? "connected" : "disconnected";
  }

  isSessionActive(): boolean {
    return this.isConnected && this.sessionConfig !== null;
  }

  /**
   * Generate speech from text using OpenAI TTS
   */
  async generateSpeech(text: string, lang?: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected to server"));
        return;
      }

      this.socket.emit(
        "tts.generate",
        { text, lang },
        (response: { success: boolean; audio?: string; error?: string }) => {
          if (response.success && response.audio) {
            // Decode base64 to ArrayBuffer
            const binaryString = atob(response.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            resolve(bytes.buffer);
          } else {
            reject(new Error(response.error || "TTS generation failed"));
          }
        }
      );
    });
  }
}
