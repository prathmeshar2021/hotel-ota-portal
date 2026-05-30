import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_SYSTEM_PROMPT, RESORT } from "./resortData";

interface ChatHistoryItem {
  role: "user" | "bot";
  content: string;
}

/**
 * Calls Gemini 1.5 Flash with the last N messages as context.
 * Always includes the resort system prompt.
 * Falls back gracefully if the API key is missing or the call fails.
 */
export async function callGemini(
  message: string,
  history: ChatHistoryItem[] = []
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return `I don't have specific information about that, but our team can help!\n\n📞 **${RESORT.phone}** (WhatsApp / Call)\n📧 **${RESORT.email}**`;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: GEMINI_SYSTEM_PROMPT,
    });

    // Use last 6 messages as conversation context
    const recentHistory = history
      .slice(-6)
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({
      history: recentHistory,
      generationConfig: {
        maxOutputTokens: 300,  // Keep responses concise
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(message);
    const text = result.response.text().trim();
    return text || "I'm not sure about that. Please call us at **+91 70006 30016** for assistance!";
  } catch (err) {
    console.error("[Gemini] API error:", err);
    return `I'm having trouble connecting right now. Please reach us directly:\n\n📞 **${RESORT.phone}** (WhatsApp / Call)\n📧 **${RESORT.email}**\n\nOur team is available **24/7**! 🙏`;
  }
}
