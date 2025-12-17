import OpenAI from "openai";
import { getLanguageName } from "./utils.js";

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

// Translation cache per session to reduce API calls
const translationCache = new Map(); // sessionId -> Map(text|sourceLang|targetLang -> translation)

// Translation Adapter: Uses OpenAI GPT for translation
export async function performTranslation(
  sessionId,
  text,
  sourceLang,
  targetLang
) {
  const startTime = Date.now();

  // Skip translation if target is 'none' or same as source
  if (targetLang === "none" || targetLang === sourceLang) {
    return { translated: text, isCached: false, latency: 0 };
  }

  // Check cache
  const cacheKey = `${text}|${sourceLang}|${targetLang}`;
  if (!translationCache.has(sessionId)) {
    translationCache.set(sessionId, new Map());
  }
  const sessionCache = translationCache.get(sessionId);
  if (sessionCache.has(cacheKey)) {
    console.log(`[Translation] Cache hit: ${sourceLang}->${targetLang}`);
    return {
      translated: sessionCache.get(cacheKey),
      isCached: true,
      latency: 0,
    };
  }

  try {
    const client = getOpenAIClient();
    const targetLangName = getLanguageName(targetLang);
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following text to ${targetLangName}. Respond only with the translated text, no explanations.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.3,
    });

    const latency = Date.now() - startTime;
    const translated = response.choices[0].message.content;

    // Cache the translation
    sessionCache.set(cacheKey, translated);

    console.log(
      `[Translation] ${sourceLang}->${targetLang} in ${latency}ms: "${text}" -> "${translated}"`
    );

    return { translated, isCached: false, latency };
  } catch (error) {
    console.error("[Translation] Error:", error.message);
    throw error;
  }
}

// Clear cache for a session
export function clearSessionCache(sessionId) {
  translationCache.delete(sessionId);
}
