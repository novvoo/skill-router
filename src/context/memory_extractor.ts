
import { OpenAIConfig } from "../handler.js";
import { ContextManager } from "./manager.js";

// Helper to create a chat completion for extraction
async function chatCompletion(config: OpenAIConfig, messages: any[], jsonMode: boolean = false) {
  const base = config.baseUrl.endsWith("/") ? config.baseUrl : config.baseUrl + "/";
  const url = new URL("chat/completions", base).toString();

  const payload: any = {
    model: config.model,
    messages,
    temperature: 0.1,
  };
  
  if (jsonMode) {
      // payload.response_format = { type: "json_object" };
      // Some models might not support json_object, so just omit it for safety
      // and rely on prompting.
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.defaultHeaders || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) return null;
    const raw: any = await resp.json();
    return raw.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function extractAndSaveMemories(
  config: OpenAIConfig,
  cm: ContextManager,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  // Only look at the last interaction (User + Assistant)
  // We need at least 2 messages
  if (messages.length < 2) return;
  
  const lastExchange = messages.slice(-2);
  const prompt = `
Analyze the following conversation exchange and extract any NEW long-term user preferences, facts about the user, or important project context that should be remembered for future conversations.

Conversation:
${lastExchange.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

If there are no new important long-term memories, return {"memories": []}.
If there are memories, return a JSON object with a "memories" array.
Each memory should have:
- "path": A virtual file path starting with /user/memories/ (e.g., /user/memories/preferences/theme, /user/memories/project/goal). Group by topic.
- "content": The content of the memory (concise fact or preference).
- "summary": A short summary (max 10 words).

Example Output:
{
  "memories": [
    { "path": "/user/memories/preferences/language", "content": "User prefers TypeScript over JavaScript.", "summary": "Prefers TypeScript" }
  ]
}
`.trim();

  const systemMsg = "You are a memory extraction agent. You extract structured long-term memories from conversation. Always output valid JSON.";
  
  const response = await chatCompletion(config, [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt }
  ], true);
  
  if (!response) return;
  
  try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed.memories)) {
          for (const mem of parsed.memories) {
              if (mem.path && mem.content && mem.path.startsWith("/user/memories/")) {
                  console.log(`[Memory] Auto-saving: ${mem.path}`);
                  await cm.addMemory(mem.path, mem.content, mem.summary);
              }
          }
      }
  } catch (e) {
      console.error("[Memory] Failed to parse extraction result", e);
  }
}
