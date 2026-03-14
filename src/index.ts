import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initWasm } from "@kreuzberg/wasm";
import { handleRequest } from "./handler.js";

// Polyfill fetch for file:// URLs to make wasm-pack glue code work in Node.js
const originalFetch = global.fetch;
// @ts-ignore
global.fetch = async (url: string | URL, options?: any) => {
    const urlString = url.toString();
    if (urlString.startsWith("file://")) {
        const filePath = fileURLToPath(urlString);
        const buffer = await fs.readFile(filePath);
        // @ts-ignore
        return new Response(buffer, {
            status: 200,
            headers: { "Content-Type": "application/wasm" },
        });
    }
    return originalFetch(url, options);
};

const host = "127.0.0.1";
const startPort = Number(process.env.PORT || "8080") || 8080;

function listen(server: http.Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function main() {
  // Initialize WASM
  await initWasm();
  
  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  let port = startPort;
  for (let i = 0; i < 20; i++) {
    try {
      await listen(server, port);
      break;
    } catch (e: any) {
      if (e?.code === "EADDRINUSE") {
        port++;
        continue;
      }
      throw e;
    }
  }

  const addr = server.address();
  const usedPort = typeof addr === "object" && addr ? addr.port : port;
  process.stdout.write(`listening on http://${host}:${usedPort}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
