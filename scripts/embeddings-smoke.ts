import { createEmbeddings } from "../src/context/embeddings.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; body: any }> = [];

  // @ts-ignore
  global.fetch = async (url: string | URL, init?: any) => {
    const urlString = url.toString();
    const bodyText = String(init?.body || "");
    const body = bodyText ? JSON.parse(bodyText) : null;
    calls.push({ url: urlString, body });

    if (!urlString.endsWith("/embeddings")) {
      return new Response("not found", { status: 404 });
    }

    const input = Array.isArray(body?.input) ? body.input : [body?.input];
    const data = input.map((_: any, index: number) => ({ index, embedding: [index, index + 1, index + 2] }));
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const config: any = {
      apiKey: "test",
      baseUrl: "https://example.invalid/v1",
      model: "gpt-test",
      embeddingModel: "fast",
    };

    const vecs = await createEmbeddings(config, ["hello", "", "world"]);
    expectOk(Array.isArray(vecs) && vecs.length === 3, "expected 3 vectors");
    expectOk(vecs.every((v: any) => Array.isArray(v) && v.length === 3), "expected all vectors to be length 3");
    expectOk(vecs[1].every((x: any) => x === 0), "expected empty input to produce zero vector");

    expectOk(calls.length === 1, "expected one embeddings HTTP call");
    expectOk(calls[0].body?.model === "fast", "expected embeddings model to be sent");
    expectOk(Array.isArray(calls[0].body?.input) && calls[0].body.input.length === 2, "expected only non-empty inputs sent");
  } finally {
    global.fetch = originalFetch;
  }

  process.stdout.write("embeddings-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
