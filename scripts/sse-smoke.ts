import http from "node:http";
import { handleRequest } from "../src/handler.ts";

function expectOk(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "smoke";
  process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://example.invalid/v1/";
  process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || "smoke";
  process.env.OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "fast";

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

        if (all.includes("对话压缩器") || all.includes("压缩成一段可供继续对话的摘要")) {
          return new Response(JSON.stringify({ choices: [{ message: { content: "smoke summary" } }] }), {
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
    const resp = await fetch(`${base}/run`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "x-openai-api-key": "smoke",
        "x-openai-base-url": "https://example.invalid/v1/",
        "x-openai-model": "smoke",
        "x-openai-embedding-model": "fast",
      },
      body: JSON.stringify({
        query: "hello",
        messages: [{ role: "user", content: "hello", sessionId: "smoke_sse" }],
      }),
    });

    expectOk(resp.ok, `POST /run (sse) failed: ${resp.status}`);
    const ct = String(resp.headers.get("content-type") || "").toLowerCase();
    expectOk(ct.includes("text/event-stream"), `expected sse content-type, got: ${ct}`);

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let gotResult = false;
    const stages = new Set<string>();

    const feed = (chunk: string) => {
      buf += chunk;
      while (true) {
        const sep = buf.indexOf("\n\n");
        if (sep < 0) break;
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const lines = block.split("\n");
        let ev = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (ev === "stage") {
          let payload: any = null;
          try {
            payload = JSON.parse(data);
          } catch {
            payload = { stage: "unknown", message: data };
          }
          stages.add(String(payload?.stage || ""));
        } else if (ev === "result") {
          gotResult = true;
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
      if (gotResult) break;
    }

    expectOk(stages.has("memory_search_config"), "missing stage: memory_search_config");
    expectOk(stages.has("memory_search"), "missing stage: memory_search");
    expectOk(gotResult, "missing result event");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    global.fetch = originalFetch;
  }

  process.stdout.write("sse-smoke: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});

