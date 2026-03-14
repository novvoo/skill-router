import { extractBytes } from "@kreuzberg/node";
import path from "path";
import fs from "fs";

async function test() {
  const text = "Hello world.";
  const buffer = Buffer.from(text, "utf-8");
  
  const cacheDir = path.resolve(process.cwd(), ".cache/models");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const config = {
    chunking: {
        maxChars: 1000,
        embedding: {
            model: {
                modelType: "preset",
                value: "balanced"
            },
            cacheDir: cacheDir,
            showDownloadProgress: true
        }
    }
  };

  try {
    console.log("Starting extraction (balanced)...");
    // @ts-ignore
    const result = await extractBytes(buffer, "text/plain", config);
    if (result.chunks && result.chunks.length > 0 && result.chunks[0].embedding) {
        console.log("Success! Embedding found.");
    } else {
        console.log("Failed: No embedding found.");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
