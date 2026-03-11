import http from "node:http";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

function mkMultipart({ fields, fileField, filename, fileContentType, data }) {
  const boundary = "----smoke" + Math.random().toString(16).slice(2);
  const parts = [];

  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`,
        "utf8",
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n${
        fileContentType ? `Content-Type: ${fileContentType}\r\n` : ""
      }\r\n`,
      "utf8",
    ),
  );
  parts.push(data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));

  return { boundary, body: Buffer.concat(parts) };
}

async function postMultipart({ port, path, mp }) {
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port,
        path,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${mp.boundary}`,
          "Content-Length": String(mp.body.byteLength),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end(mp.body);
  });
}

const port = Number(process.env.PORT || "8080") || 8080;
const pdf = await readFile(new URL("../example/hacpo.pdf", import.meta.url));

const mp1 = mkMultipart({
  fields: {},
  fileField: "file",
  filename: "a.pdf",
  fileContentType: "",
  data: pdf,
});

const mp2 = mkMultipart({
  fields: {},
  fileField: "file",
  filename: "a.pdf",
  fileContentType: "application/pdf",
  data: pdf,
});

const r1 = await postMultipart({ port, path: "/documents/extract", mp: mp1 });
process.stdout.write(`no mime_type field => ${r1.status}\n${r1.body}\n\n`);

const r2 = await postMultipart({ port, path: "/documents/extract", mp: mp2 });
process.stdout.write(`file Content-Type only => ${r2.status}\n${r2.body}\n`);
