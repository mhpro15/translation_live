import OpenAI from "openai";

// Lazy initialization to ensure env vars are loaded
let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. Please add it to your .env file."
      );
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Generate speech from text using OpenAI TTS API
 * @param {string} text - The text to convert to speech
 * @param {string} lang - Language code (e.g., 'en', 'ja', 'es', 'fr', 'ko')
 * @returns {Promise<Buffer>} Audio buffer in MP3 format
 */
export async function generateSpeech(text, lang = "en") {
  try {
    if (!text || !text.trim()) {
      throw new Error("Text is required for speech generation");
    }

    const client = getOpenAIClient();

    console.log(
      `TTS Request: lang=${lang}, text="${text.substring(0, 50)}..."`
    );

    // OpenAI TTS automatically handles multiple languages
    // Choose voice based on preference (alloy is neutral and works well for all languages)
    const response = await client.audio.speech.create({
      model: "tts-1", // or 'tts-1-hd' for higher quality
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text.trim(),
      response_format: "mp3",
      speed: 1.0,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `TTS Success: Generated ${buffer.length} bytes for "${text.substring(
        0,
        30
      )}..."`
    );

    return buffer;
  } catch (error) {
    console.error("TTS generation error:", error.message);
    console.error("Error details:", error);
    throw new Error(`Failed to generate speech: ${error.message}`);
  }
}
