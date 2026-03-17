import http from "node:http";
import path from "node:path";
import { handleRequest } from "./handler.js";
import { getOnnxRuntimePath } from "./utils.js";

// Configure ONNX Runtime path for Kreuzberg
const onnxPath = getOnnxRuntimePath();
process.env.ORT_DYLIB_PATH = onnxPath;
console.log(`Configured ORT_DYLIB_PATH: ${onnxPath}`);

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
