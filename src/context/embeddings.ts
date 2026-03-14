
import { extractBytes } from "@kreuzberg/wasm";
import { OpenAIConfig } from "../handler.js";

const VALID_PRESETS = new Set(["fast", "balanced", "quality", "multilingual"]);

export async function createEmbeddings(config: OpenAIConfig, input: string | string[]): Promise<number[][]> {
  const inputs = Array.isArray(input) ? input : [input];
  
  // Determine preset from config, defaulting to "fast" if invalid or not provided
  let preset = String(config.embeddingModel || "").toLowerCase();
  if (!VALID_PRESETS.has(preset)) {
    // Map OpenAI model names to presets if possible, otherwise default
    if (preset.includes("small")) preset = "fast";
    else if (preset.includes("large")) preset = "quality";
    else preset = "fast";
  }

  const results = await Promise.all(inputs.map(async (text) => {
    if (!text.trim()) return new Array(384).fill(0); // Return zero vector for empty text

    try {
      const buffer = Buffer.from(text, "utf-8");
      const result = await extractBytes(buffer, "text/plain", {
        chunking: {
          maxChars: 100000, // Try to keep as single chunk
          maxOverlap: 0,
          embedding: {
            model: {
              modelType: "preset",
              value: preset
            }
          }
        } as any
      });

      if (result.chunks && result.chunks.length > 0) {
        const emb = result.chunks[0].embedding;
        if (emb) return emb;
      }
      
      // Some versions return embeddings at the root
      if ((result as any).embeddings && (result as any).embeddings.length > 0) {
          return (result as any).embeddings[0];
      }
      
      console.warn("Kreuzberg returned no embedding for input");
      return new Array(384).fill(0); // Fallback
    } catch (e: any) {
      console.error("Kreuzberg embedding failed:", e);
      throw e;
    }
  }));

  return results;
}
