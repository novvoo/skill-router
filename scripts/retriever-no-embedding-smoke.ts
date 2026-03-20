import { ContextRetriever } from "../src/context/retriever.ts";
import { VirtualFileSystem } from "../src/context/vfs.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const vfs = new VirtualFileSystem();
  let called = 0;
  const embed = async (_text: string) => {
    called++;
    throw new Error("embedding should not be called when no indexed vectors exist");
  };

  const retriever = new ContextRetriever(vfs, embed);
  const result = await retriever.retrieve({ query: "hello", maxResults: 5 });
  expectOk(called === 0, "expected query embedding to be skipped");
  expectOk(Array.isArray(result.nodes) && result.nodes.length === 0, "expected no retrieved nodes");

  process.stdout.write("retriever-no-embedding-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
