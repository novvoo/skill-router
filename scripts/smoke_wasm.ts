import { extractBytes } from "@kreuzberg/node";

async function test() {
  try {
    const text = "Hello world. This is a smoke test for @kreuzberg/node.";
    const buffer = Buffer.from(text, "utf-8");
    const uint8Array = new Uint8Array(buffer);
    
    console.log("Extracting content...");
    const result = await extractBytes(uint8Array, "text/plain");
    console.log("Extracted content:", result.content);
    
    // Test if we can pass embeddings: true even if it's not in the type definition
    console.log("Attempting extraction with embeddings: true...");
    // @ts-ignore
    const resultWithEmb = await extractBytes(uint8Array, "text/plain", { embeddings: true });
    console.log("Result with embeddings keys:", Object.keys(resultWithEmb));
    if (resultWithEmb.embeddings) {
        console.log("Embeddings found in root!");
    } else if (resultWithEmb.chunks && resultWithEmb.chunks[0]?.embedding) {
        console.log("Embeddings found in chunks!");
    } else {
        console.log("No embeddings found.");
    }

  } catch (e) {
    console.error("Smoke test failed:", e);
  }
}

test();

