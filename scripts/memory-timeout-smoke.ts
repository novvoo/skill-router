import { ContextManager } from "../src/context/manager.js";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  process.env.OPENAI_EMBED_TIMEOUT_MS = "20";
  process.env.MEMORY_INDEX_ITEM_TIMEOUT_MS = "30";
  process.env.MEMORY_INDEX_CONCURRENCY = "32";

  const originalFetch = global.fetch;
  global.fetch = async (_url: any, init?: any) => {
    const signal: AbortSignal | undefined = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const onAbort = () => reject(new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };

  try {
    const cm = new ContextManager({
      apiKey: "smoke",
      baseUrl: "https://example.invalid/v1/",
      model: "smoke",
      embeddingModel: "text-embedding-3-small",
    });
    await cm.addMemory("/user/memories/smoke.md", "hello world");

    const t0 = Date.now();
    const result = await cm.search("hello", { maxResults: 1 });
    const dt = Date.now() - t0;

    expectOk(dt < 15_000, `search took too long: ${dt}ms`);
    expectOk(Array.isArray(result?.nodes), "search result nodes missing");
  } finally {
    global.fetch = originalFetch;
  }

  process.stdout.write("memory-timeout-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
