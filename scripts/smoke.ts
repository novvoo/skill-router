import http from "node:http";
import { handleRequest } from "../src/handler.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function headerValue(res: Response, name: string) {
  return String(res.headers.get(name) || "");
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

  try {
    const htmlResp = await fetch(`${base}/`, { headers: { accept: "text/html" } });
    expectOk(htmlResp.ok, `GET / (html) failed: ${htmlResp.status}`);
    const html = await htmlResp.text();
    expectOk(html.includes("/vendor/highlight.js/styles/github-dark.css"), "index.html missing highlight css link");

    const markedResp = await fetch(`${base}/vendor/marked/lib/marked.esm.js`);
    expectOk(markedResp.ok, `GET marked failed: ${markedResp.status}`);
    expectOk(headerValue(markedResp, "content-type").includes("text/javascript"), "marked content-type is not js");

    const cssResp = await fetch(`${base}/vendor/highlight.js/styles/github-dark.css`);
    expectOk(cssResp.ok, `GET highlight css failed: ${cssResp.status}`);
    expectOk(headerValue(cssResp, "content-type").includes("text/css"), "highlight css content-type is not css");

    const hljsBundleResp = await fetch(`${base}/vendor/highlight.js/common.js`);
    expectOk(hljsBundleResp.ok, `GET highlight bundle failed: ${hljsBundleResp.status}`);
    expectOk(headerValue(hljsBundleResp, "content-type").includes("text/javascript"), "highlight bundle content-type is not js");

    const hljsEsmResp = await fetch(`${base}/vendor/highlight.js/es/common.js`);
    expectOk(hljsEsmResp.ok, `GET highlight es/common.js failed: ${hljsEsmResp.status}`);
    expectOk(headerValue(hljsEsmResp, "content-type").includes("text/javascript"), "highlight es/common.js content-type is not js");

    const jsResp = await fetch(`${base}/app.js`);
    expectOk(jsResp.ok, `GET /app.js failed: ${jsResp.status}`);
    const js = await jsResp.text();
    expectOk(js.includes("marked") && js.includes("highlight.js") && js.includes("dompurify"), "app.js missing markdown/highlight imports");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  process.stdout.write("smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
