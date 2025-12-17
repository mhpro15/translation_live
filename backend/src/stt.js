import OpenAI from "openai";
import { pcmToWav } from "./utils.js";
import fs from "fs";
import path from "path";
import os from "os";

let openai = null;

function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// STT Adapter: Uses OpenAI Whisper API
export async function performSTT(audioBuffer, language = "en") {
  const startTime = Date.now();
  let tempFilePath = null;

  try {
    const client = getOpenAIClient();

    // Validate language code
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      throw new Error("audioBuffer must be a Buffer instance");
    }

    // Convert buffer to WAV format for Whisper
    console.log(
      `[STT] Converting ${audioBuffer.length} bytes of PCM to WAV format`
    );
    const wavBuffer = pcmToWav(audioBuffer, 16000, 1);
    console.log(
      `[STT] WAV buffer created: ${
        wavBuffer.length
      } bytes (header: 44 + data: ${wavBuffer.length - 44})`
    );

    // Write to temporary file for OpenAI SDK
    // The SDK needs a proper file with correct metadata
    tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, wavBuffer);
    console.log(`[STT] Temporary WAV file written: ${tempFilePath}`);

    // Create readable stream from temp file
    const audioFile = fs.createReadStream(tempFilePath);

    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: language === "auto" ? undefined : language.substring(0, 2), // Whisper uses 2-letter codes, undefined = auto-detect
      temperature: 0.3,
    });

    const latency = Date.now() - startTime;
    console.log(
      `[STT] Transcription completed in ${latency}ms: "${response.text}"`
    );

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return {
      text: response.text,
      isFinal: true, // For MVP, all Whisper results are final
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(
      `[STT] Error during transcription (${latency}ms):`,
      error.message
    );

    // Provide detailed error information for debugging
    if (error.response) {
      console.error("[STT] API Error Response:", {
        status: error.response.status,
        data: error.response.data,
      });
    } else if (error.error) {
      console.error("[STT] OpenAI Error Details:", error.error);
    }

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkError) {
        console.error(
          "[STT] Failed to clean up temp file:",
          unlinkError.message
        );
      }
    }

    // Re-throw with context
    const errorMessage =
      error.error?.message || error.message || "Unknown STT error";
    throw new Error(`STT failed: ${errorMessage}`);
  }
}
