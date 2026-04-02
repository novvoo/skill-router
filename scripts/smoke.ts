import http from "node:http";
import { handleRequest } from "../src/handler.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function headerValue(res: Response, name: string) {
  return String(res.headers.get(name) || "");
}

async function main() {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "smoke";
  process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://example.invalid/v1/";
  process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || "smoke";

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

  const originalFetch = global.fetch;
  // @ts-ignore
  global.fetch = async (url: string | URL, init?: any) => {
    const urlString = url.toString();
    if (urlString.startsWith(`http://${host}:`) || urlString.startsWith(`https://${host}:`)) {
      return originalFetch(url as any, init);
    }
    if (urlString.includes("example.invalid")) {
      const bodyText = String(init?.body || "");
      let body: any = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        body = null;
      }

      if (urlString.includes("/chat/completions")) {
        const msgs = Array.isArray(body?.messages) ? body.messages : [];
        const all = msgs.map((m: any) => String(m?.content || "")).join("\n");

        if (all.includes("Skill 路由器") || all.includes("请选择 skill")) {
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"skill":"none","confidence":1,"reason":"smoke"}' } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (all.includes("memory extraction agent") || all.includes("memories")) {
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"memories":[]}' } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (all.includes("对话压缩器") || all.includes("压缩成一段可供继续对话的摘要")) {
          return new Response(JSON.stringify({ choices: [{ message: { content: "smoke summary" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlString.includes("/embeddings")) {
        const input = Array.isArray(body?.input) ? body.input : [body?.input];
        const data = input.map((_: any, index: number) => ({ index, embedding: [index, index + 1, index + 2] }));
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const htmlResp = await fetch(`${base}/`, { headers: { accept: "text/html" } });
    expectOk(htmlResp.ok, `GET / (html) failed: ${htmlResp.status}`);
    const html = await htmlResp.text();
    expectOk(html.includes("/vendor/highlight.js/styles/github-dark.css"), "index.html missing highlight css link");
    expectOk(html.includes('id="customHeadersBody"'), "index.html missing customHeadersBody");
    expectOk(html.includes('id="addCustomHeader"'), "index.html missing addCustomHeader");
    expectOk(!html.includes('id="defaultHeaders"'), "index.html should not include defaultHeaders textarea");
    expectOk(html.includes('id="skillsBody"'), "index.html missing skillsBody");
    expectOk(!html.includes('id="skillsOut"'), "index.html should not include skillsOut pre");

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

    const fd = new FormData();
    fd.append("query", "这个文档有提供测试地址吗？");
    fd.append("mime_type", "text/plain");
    fd.append("file", new Blob(["测试地址：https://test.example.com\n正式地址：https://www.example.com\n"], { type: "text/plain" }), "doc.txt");
    fd.append("file", new Blob(["预发地址：https://staging.example.com\n"], { type: "text/plain" }), "doc2.txt");
    const runResp = await fetch(`${base}/run`, { method: "POST", body: fd });
    expectOk(runResp.ok, `POST /run (multipart) failed: ${runResp.status}`);
    const runJson: any = await runResp.json();
    const content = String(runJson?.response || "");
    expectOk(content.includes("test.example.com"), "run response missing extracted test url");
    expectOk(content.includes("staging.example.com"), "run response missing extracted staging url");
    expectOk(Array.isArray(runJson?.documents) && runJson.documents.length === 2, "run documents should include 2 items");

    const run2Resp = await fetch(`${base}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openai-api-key": "smoke",
        "x-openai-base-url": "https://example.invalid/v1/",
        "x-openai-model": "smoke",
        "x-openai-embedding-model": "fast",
      },
      body: JSON.stringify({ query: "hello", messages: [{ role: "user", content: "hello", sessionId: "smoke" }] }),
    });
    expectOk(run2Resp.ok, `POST /run (json) failed: ${run2Resp.status}`);
    const run2: any = await run2Resp.json();
    expectOk(run2?.models?.chat === "smoke", "run models.chat should be set");
    expectOk(run2?.models?.embedding?.provider === "kreuzberg", "run models.embedding provider mismatch");
    expectOk(String(run2?.models?.embedding?.preset || "").includes("fast"), "run models.embedding preset mismatch");

    const fd2 = new FormData();
    fd2.append("file", new Blob(["hello"], { type: "text/plain" }), "a.txt");
    fd2.append("file", new Blob(["world"], { type: "text/plain" }), "b.txt");
    const docResp = await fetch(`${base}/documents/extract`, { method: "POST", body: fd2 });
    expectOk(docResp.ok, `POST /documents/extract (multipart) failed: ${docResp.status}`);
    const docJson: any = await docResp.json();
    expectOk(Array.isArray(docJson?.results) && docJson.results.length === 2, "documents/extract results should include 2 items");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    global.fetch = originalFetch;
  }

  process.stdout.write("smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
