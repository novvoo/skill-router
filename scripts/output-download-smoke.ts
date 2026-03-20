import http from "node:http";
import path from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { handleRequest } from "../src/handler.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const host = "127.0.0.1";
  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });

  const addr = server.address();
  expectOk(typeof addr === "object" && addr, "server address missing");
  const port = (addr as any).port;
  const base = `http://${host}:${port}`;

  const outDir = path.resolve(process.cwd(), "output", "smoke");
  const absFile = path.resolve(outDir, "hello.txt");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(absFile, "hello", "utf8");

  try {
    const resp = await fetch(`${base}/outputs/smoke/hello.txt`);
    expectOk(resp.ok, `GET /outputs failed: ${resp.status}`);
    const body = await resp.text();
    expectOk(body === "hello", "download body mismatch");
    const disp = String(resp.headers.get("content-disposition") || "");
    expectOk(disp.toLowerCase().includes("attachment"), "missing attachment header");
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

await main();
