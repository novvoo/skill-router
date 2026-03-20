import { createEmbeddings } from "../src/context/embeddings.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const config: any = {
    apiKey: "test",
    baseUrl: "https://example.invalid/v1",
    model: "gpt-test",
    embeddingModel: "balanced",
    hfEndpoint: "https://hf-mirror.com",
  };

  const vecs = await createEmbeddings(config, ["", "   ", "\n"]);
  expectOk(Array.isArray(vecs) && vecs.length === 3, "expected 3 vectors");
  expectOk(vecs.every((v: any) => Array.isArray(v) && v.length === 768), "expected balanced dim=768");
  expectOk(vecs.every((v: any) => v.every((x: any) => x === 0)), "expected all-zero vectors");

  process.stdout.write("kreuzberg-empty-input-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
