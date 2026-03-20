import http from "node:http";
import { handleRequest } from "../src/handler.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const originalFetch = global.fetch;
  // @ts-ignore
  global.fetch = async (url: string | URL, init?: any) => {
    const urlString = url.toString();
    if (urlString.startsWith("http://127.0.0.1:") || urlString.startsWith("http://localhost:")) {
      return originalFetch(url as any, init);
    }
    if (urlString.endsWith("/embeddings")) {
      throw new Error("embeddings endpoint should not be called when memory is disabled");
    }
    if (!urlString.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404 });
    }
    const bodyText = String(init?.body || "");
    const body = bodyText ? JSON.parse(bodyText) : null;
    const wantsJsonObject = body && typeof body === "object" && "response_format" in body && body.response_format;
    const sys0 = Array.isArray(body?.messages) ? String(body.messages[0]?.content || "") : "";
    const isMemoryExtractor = sys0.toLowerCase().includes("memory extraction agent");
    const content = isMemoryExtractor ? '{"memories":[]}' : wantsJsonObject ? '{"skill":"none","confidence":0.0,"reason":"test"}' : "ok";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const server = http.createServer((req, res) => void handleRequest(req, res));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  expectOk(port, "expected an ephemeral port");

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openai-api-key": "test",
        "x-openai-base-url": "https://example.invalid/v1",
        "x-openai-model": "gpt-test",
        "x-openai-embedding-model": "text-embedding-3-small",
      },
      body: JSON.stringify({
        query: "hi",
        messages: [{ role: "user", content: "hi" }],
        memory: { enabled: false },
      }),
    });
    const text = await resp.text();
    expectOk(resp.ok, `expected 200, got ${resp.status}: ${text}`);
    const json = text ? JSON.parse(text) : null;
    expectOk(json?.memory?.retrieval_called === false, "expected retrieval_called=false");
  } finally {
    server.close();
    // @ts-ignore
    global.fetch = originalFetch;
  }

  process.stdout.write("run-memory-disabled-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
