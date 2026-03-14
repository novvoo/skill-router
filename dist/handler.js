import path from "node:path";
import { readFile } from "node:fs/promises";
import Busboy from "busboy";
import { extractBytes } from "@kreuzberg/node";
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-OpenAI-API-Key,X-OpenAI-Base-URL,X-OpenAI-Model,X-OpenAI-Default-Headers,X-OpenAI-System-Content",
};
function writeCorsHeaders(res) {
    for (const [k, v] of Object.entries(corsHeaders))
        res.setHeader(k, v);
}
function sendJson(res, status, data) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    writeCorsHeaders(res);
    res.end(JSON.stringify(data, null, 2));
}
function sendText(res, status, contentType, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", contentType);
    writeCorsHeaders(res);
    res.end(body);
}
async function readRequestBody(req, maxBytes) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += b.byteLength;
        if (total > maxBytes)
            throw new Error("payload too large");
        chunks.push(b);
    }
    return Buffer.concat(chunks);
}
async function readJsonBody(req, maxBytes) {
    const ct = String(req.headers["content-type"] || "");
    if (!ct.toLowerCase().includes("application/json"))
        throw new Error("Content-Type must be application/json");
    const raw = await readRequestBody(req, maxBytes);
    const text = raw.toString("utf8").trim();
    if (!text)
        return {};
    return JSON.parse(text);
}
function mimeTypeFromFilename(filename) {
    const name = String(filename || "").toLowerCase();
    const ext = path.extname(name);
    if (!ext)
        return null;
    const map = {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".csv": "text/csv",
        ".json": "application/json",
        ".xml": "application/xml",
        ".html": "text/html",
        ".htm": "text/html",
        ".rtf": "application/rtf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".doc": "application/msword",
        ".xls": "application/vnd.ms-excel",
        ".ppt": "application/vnd.ms-powerpoint",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".zip": "application/zip",
    };
    return map[ext] || null;
}
function mimeTypeFromBytes(data) {
    if (!data || data.byteLength < 4)
        return null;
    const pdfWindow = data.slice(0, Math.min(1024, data.byteLength)).toString("latin1");
    if (pdfWindow.includes("%PDF-"))
        return "application/pdf";
    if (data.byteLength >= 8 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47 &&
        data[4] === 0x0d &&
        data[5] === 0x0a &&
        data[6] === 0x1a &&
        data[7] === 0x0a)
        return "image/png";
    if (data.byteLength >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
        return "image/jpeg";
    if (data.byteLength >= 6) {
        const head6 = data.slice(0, 6).toString("ascii");
        if (head6 === "GIF87a" || head6 === "GIF89a")
            return "image/gif";
    }
    if (data.byteLength >= 12 && data.slice(0, 4).toString("ascii") === "RIFF" && data.slice(8, 12).toString("ascii") === "WEBP")
        return "image/webp";
    if (data.byteLength >= 4) {
        const b0 = data[0];
        const b1 = data[1];
        const b2 = data[2];
        const b3 = data[3];
        const isZip = b0 === 0x50 && b1 === 0x4b && (b2 === 0x03 || b2 === 0x05 || b2 === 0x07) && (b3 === 0x04 || b3 === 0x06 || b3 === 0x08);
        if (isZip)
            return "application/zip";
        const isOle = b0 === 0xd0 && b1 === 0xcf && b2 === 0x11 && b3 === 0xe0;
        if (isOle)
            return "application/x-ole-storage";
    }
    return null;
}
function resolveMimeType(args) {
    const provided = String(args.provided || "").trim();
    if (provided)
        return provided;
    const fileMime = String(args.fileMimeType || "").trim();
    if (args.data) {
        const byBytes = mimeTypeFromBytes(args.data);
        if (byBytes) {
            const byName = mimeTypeFromFilename(args.filename);
            if (byBytes === "application/zip" && byName)
                return byName;
            if (byBytes === "application/x-ole-storage" && byName)
                return byName;
            return byBytes;
        }
    }
    const byName = mimeTypeFromFilename(args.filename);
    if (byName)
        return byName;
    if (fileMime && fileMime !== "application/octet-stream")
        return fileMime;
    if (fileMime)
        return fileMime;
    return "";
}
function buildAvailableSkillsPrompt(skills) {
    const lines = ["<available_skills>"];
    for (const s of skills) {
        const desc = String(s.description || "")
            .split(/\s+/)
            .filter(Boolean)
            .join(" ");
        lines.push(`"${s.name}": ${desc}`);
    }
    lines.push("</available_skills>");
    return lines.join("\n");
}
function parseChoiceJson(text) {
    const raw = String(text || "").trim();
    try {
        return JSON.parse(raw);
    }
    catch {
    }
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m)
        return null;
    try {
        return JSON.parse(m[0]);
    }
    catch {
        return null;
    }
}
function parseJsonLoose(text) {
    const raw = String(text || "").trim();
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
    }
    const m = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!m)
        return null;
    try {
        return JSON.parse(m[1]);
    }
    catch {
        return null;
    }
}
function headersFromRequest(req) {
    const skip = new Set([
        "host",
        "connection",
        "content-length",
        "content-type",
        "accept",
        "accept-encoding",
        "accept-language",
        "user-agent",
        "origin",
        "referer",
        "pragma",
        "cache-control",
        "cookie",
        "sec-fetch-site",
        "sec-fetch-mode",
        "sec-fetch-dest",
        "sec-fetch-user",
        "sec-ch-ua",
        "sec-ch-ua-mobile",
        "sec-ch-ua-platform",
    ]);
    const out = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
        const key = String(k || "").toLowerCase();
        if (!key)
            continue;
        if (skip.has(key))
            continue;
        if (key.startsWith("sec-"))
            continue;
        if (key.startsWith("x-openai-"))
            continue;
        if (key.startsWith("access-control-"))
            continue;
        if (key === "x-forwarded-for" || key === "x-forwarded-proto" || key === "x-forwarded-host")
            continue;
        if (Array.isArray(v))
            continue;
        const value = String(v ?? "").trim();
        if (!value)
            continue;
        out[key] = value;
    }
    return out;
}
function normalizeChatHistoryMessages(input) {
    if (!Array.isArray(input))
        return null;
    const out = [];
    for (const m of input) {
        const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
        if (!role)
            continue;
        const content = String(m?.content ?? m?.text ?? "");
        if (!content)
            continue;
        out.push({ role, content });
    }
    return out.length ? out : null;
}
function chatHistoryChars(messages) {
    let n = 0;
    for (const m of messages)
        n += m.content.length;
    return n;
}
function buildTranscript(messages, maxChars) {
    const lines = [];
    let used = 0;
    for (const m of messages) {
        const prefix = m.role === "user" ? "User: " : "Assistant: ";
        const text = String(m.content || "").replace(/\s+$/g, "");
        if (!text)
            continue;
        const line = prefix + text;
        if (used + line.length + 1 > maxChars)
            break;
        lines.push(line);
        used += line.length + 1;
    }
    return lines.join("\n");
}
function normalizeChosenSkill(parsed, skillsByName) {
    const skill = (parsed?.skill ?? "none") || "none";
    const confidence = Number(parsed?.confidence ?? 0.0) || 0.0;
    const reason = String(parsed?.reason ?? "");
    if (skill !== "none" && !skillsByName.get(skill)) {
        return { skill: "none", confidence, reason: `选择了不存在的 skill: "${skill}"` };
    }
    return { skill: String(skill), confidence, reason };
}
function getOpenAIConfigFromRequest(req) {
    const headerKey = String(req.headers["x-openai-api-key"] || "");
    const headerBase = String(req.headers["x-openai-base-url"] || "");
    const headerModel = String(req.headers["x-openai-model"] || "");
    const headerDefaultHeaders = String(req.headers["x-openai-default-headers"] || "");
    const headerSystemContent = String(req.headers["x-openai-system-content"] || "");
    const apiKey = headerKey || String(process.env.OPENAI_API_KEY || "");
    const baseUrl = (headerBase || String(process.env.OPENAI_BASE_URL || "")).trim();
    const model = (headerModel || String(process.env.OPENAI_MODEL || "")).trim();
    let defaultHeaders;
    const rawDefaultHeaders = headerDefaultHeaders || process.env.OPENAI_DEFAULT_HEADERS;
    if (rawDefaultHeaders) {
        try {
            defaultHeaders = JSON.parse(rawDefaultHeaders);
        }
        catch {
            // ignore invalid JSON
        }
    }
    const requestHeaders = headersFromRequest(req);
    if (Object.keys(requestHeaders).length) {
        defaultHeaders = { ...(defaultHeaders || {}), ...requestHeaders };
    }
    let systemContent = headerSystemContent || process.env.OPENAI_SYSTEM_CONTENT;
    if (systemContent && systemContent.includes("%")) {
        try {
            systemContent = decodeURIComponent(systemContent);
        }
        catch {
            // ignore
        }
    }
    if (!apiKey)
        throw new Error("OPENAI_API_KEY is required");
    if (!baseUrl)
        throw new Error("OPENAI_BASE_URL is required");
    if (!model)
        throw new Error("OPENAI_MODEL is required");
    return { apiKey, baseUrl, model, defaultHeaders, systemContent };
}
function parseCatalogMarkdown(md) {
    const skills = [];
    const lines = String(md || "").split(/\r?\n/);
    for (const line of lines) {
        const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*$/);
        if (!m)
            continue;
        const name = m[1].trim();
        const link = m[2].trim();
        const description = m[3].trim();
        const location = m[4].trim();
        if (!name || !link.toLowerCase().endsWith("/skill.md"))
            continue;
        skills.push({
            name,
            description,
            path: link,
            location,
            priority_group: "project",
        });
    }
    skills.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const byName = new Map();
    const shadowed = new Map();
    for (const s of skills) {
        const existing = byName.get(s.name);
        if (!existing)
            byName.set(s.name, s);
        else {
            if (!shadowed.has(s.name))
                shadowed.set(s.name, []);
            shadowed.get(s.name).push(s);
        }
    }
    return { list: [...byName.values()], byName, shadowed };
}
const AGENTS_DIR = path.resolve(process.cwd(), "agent/skills");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const NODE_MODULES_DIR = path.resolve(process.cwd(), "node_modules");
const CATALOG_PATH = path.resolve(AGENTS_DIR, "CATALOG.md");
const CATALOG_TTL_MS = 5 * 60 * 1000;
let cachedCatalog = null;
let cachedCatalogAt = 0;
async function loadCatalog() {
    const now = Date.now();
    if (cachedCatalog && now - cachedCatalogAt < CATALOG_TTL_MS)
        return cachedCatalog;
    const md = await readFile(CATALOG_PATH, "utf8");
    cachedCatalog = parseCatalogMarkdown(md);
    cachedCatalogAt = now;
    return cachedCatalog;
}
async function fetchSkillText(skillPath) {
    const safePath = String(skillPath || "").replace(/^\/+/, "");
    if (!safePath || safePath.includes("..") || safePath.includes("\\") || safePath.includes("\0")) {
        throw new Error("Invalid skill path");
    }
    const abs = path.resolve(AGENTS_DIR, safePath);
    const rel = path.relative(AGENTS_DIR, abs);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
        throw new Error("Invalid skill path");
    return await readFile(abs, "utf8");
}
async function chatCompletions(config, { messages, temperature = 0.0, max_tokens, response_format, }) {
    const base = config.baseUrl.endsWith("/") ? config.baseUrl : config.baseUrl + "/";
    const url = new URL("chat/completions", base).toString();
    const finalMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    if (config.systemContent) {
        finalMessages.unshift({ role: "system", content: config.systemContent });
    }
    const payload = {
        model: config.model,
        messages: finalMessages,
        temperature,
    };
    if (typeof max_tokens === "number")
        payload.max_tokens = max_tokens;
    if (response_format)
        payload.response_format = response_format;
    let resp;
    try {
        resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
                ...(config.defaultHeaders || {}),
            },
            body: JSON.stringify(payload),
        });
    }
    catch (e) {
        const cause = e?.cause;
        const detail = cause?.code || cause?.message || e?.message || String(e);
        throw new Error(`OpenAI-compatible fetch failed (${url}): ${detail}`);
    }
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`OpenAI-compatible HTTPError ${resp.status}: ${body}`);
    }
    const raw = await resp.json();
    const content = raw?.choices?.[0]?.message?.content ?? "";
    return { content: String(content || ""), raw };
}
async function chooseSkill(config, query) {
    const catalog = await loadCatalog();
    const skills = catalog.list;
    const systemContent = [
        "你是一个 Skill 路由器。你只能从可用列表中选择一个最合适的 skill，或者返回 none。只输出 JSON，不要输出其它内容。",
        buildAvailableSkillsPrompt(skills),
    ].join("\n\n");
    const messages = [
        { role: "system", content: systemContent },
        {
            role: "user",
            content: `用户输入如下，请选择 skill：\n\n${query}\n\n输出格式：{"skill":"<name|none>","confidence":0-1,"reason":"..."}`,
        },
    ];
    let result;
    try {
        result = await chatCompletions(config, { messages, temperature: 0.0, max_tokens: 300, response_format: { type: "json_object" } });
    }
    catch {
        result = await chatCompletions(config, { messages, temperature: 0.0, max_tokens: 300 });
    }
    const parsed = parseChoiceJson(result.content);
    if (!parsed)
        return { skill: "none", confidence: 0.0, reason: "模型输出无法解析为 JSON" };
    return normalizeChosenSkill(parsed, catalog.byName);
}
function buildDocumentBlock(doc) {
    const name = doc.filename || "upload";
    const truncated = doc.truncated ? "，已截断" : "";
    return [
        "",
        "---",
        `用户上传的参考文档（${name}，${doc.mimeType}，提取文本 ${doc.contentChars} 字符${truncated}）：`,
        '"""',
        doc.content,
        '"""',
        "---",
    ].join("\n");
}
function buildUserContent(query, doc) {
    if (!doc)
        return query;
    return `${query}\n${buildDocumentBlock(doc)}`;
}
function withDocumentInLastUserMessage(messages, doc) {
    if (!doc)
        return messages;
    const block = buildDocumentBlock(doc);
    const out = [...messages];
    for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].role === "user") {
            out[i] = { ...out[i], content: `${out[i].content}\n${block}` };
            return out;
        }
    }
    return [...out, { role: "user", content: block }];
}
async function summarizeConversation(config, older, existingSummary) {
    const head = existingSummary ? `已有摘要：\n${String(existingSummary || "").trim()}\n\n` : "";
    const transcript = buildTranscript(older, 9000);
    const userContent = `${head}请把下面对话压缩成一段可供继续对话的摘要：\n- 保留用户目标/约束/偏好、已做决定、关键上下文、未解决问题\n- 删除寒暄与重复\n- 输出纯文本\n\n${transcript}`;
    const messages = [
        { role: "system", content: "你是对话压缩器，负责把长对话压缩为高信息密度摘要。" },
        { role: "user", content: userContent },
    ];
    const result = await chatCompletions(config, { messages, temperature: 0.1, max_tokens: 400 });
    return String(result.content || "").trim();
}
async function compressChatHistory(config, messages, summary) {
    const MAX_CHARS = 12000;
    const KEEP_LAST = 12;
    const needs = messages.length > KEEP_LAST * 2 || chatHistoryChars(messages) > MAX_CHARS;
    const existing = String(summary || "").trim();
    if (!needs)
        return { summary: existing, summarized: false, messages };
    const older = messages.slice(0, Math.max(0, messages.length - KEEP_LAST));
    const recent = messages.slice(Math.max(0, messages.length - KEEP_LAST));
    if (!older.length)
        return { summary: existing, summarized: false, messages: recent };
    const next = await summarizeConversation(config, older, existing || null);
    const nextSummary = next || existing;
    return { summary: nextSummary, summarized: Boolean(next && next !== existing), messages: recent };
}
export function stripLeadingSkillAnnouncements(raw, skillsByName) {
    const lines = String(raw || "").split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            i++;
            continue;
        }
        const m = trimmed.match(/^Using\s+(\S+)\s+to\s+.+$/);
        if (!m)
            break;
        const skill = m[1];
        if (!skillsByName.has(skill))
            break;
        i++;
        while (i < lines.length && !lines[i].trim())
            i++;
    }
    return lines.slice(i).join("\n").trim();
}
async function runWithRouting(config, args) {
    const catalog = await loadCatalog();
    const doc = args.doc || null;
    const incoming = args.messages && args.messages.length ? args.messages : null;
    const fallbackQuery = String(args.query || "").trim();
    const baseMessages = incoming
        ? incoming
        : fallbackQuery
            ? [{ role: "user", content: fallbackQuery }]
            : [];
    if (!baseMessages.length)
        throw new Error("query or messages is required");
    const summaryIn = String(args.summary || "").trim();
    const withDoc = withDocumentInLastUserMessage(baseMessages, doc);
    const normalized = normalizeChatHistoryMessages(withDoc);
    if (!normalized)
        throw new Error("invalid messages format");
    const compressed = await compressChatHistory(config, normalized, summaryIn);
    const summary = String(compressed.summary || "").trim();
    const lastUser = [...compressed.messages].reverse().find((m) => m.role === "user")?.content || fallbackQuery;
    const routingDocSnippet = doc?.content ? doc.content.slice(0, 2000) : "";
    const routingParts = [
        lastUser,
        summary ? `\n\n[对话摘要]\n${summary}` : "",
        compressed.messages.length ? `\n\n[最近对话]\n${buildTranscript(compressed.messages.slice(-8), 3000)}` : "",
        doc ? `\n\n[用户上传文档节选]\n${routingDocSnippet}` : "",
    ].filter(Boolean);
    const chosen = await chooseSkill(config, routingParts.join(""));
    if (chosen.skill === "none") {
        const promptMessages = [
            { role: "system", content: "你是一个有帮助的助手。" },
            ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
            ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
        const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
        return {
            chosen,
            skill: null,
            used_skills: [],
            response: content,
            summary,
            summarized: compressed.summarized,
            messages: [...compressed.messages, { role: "assistant", content }],
        };
    }
    const meta = catalog.byName.get(chosen.skill) || null;
    if (!meta) {
        const promptMessages = [
            { role: "system", content: "你是一个有帮助的助手。" },
            ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
            ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
        const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
        return {
            chosen,
            skill: null,
            used_skills: [],
            response: content,
            summary,
            summarized: compressed.summarized,
            messages: [...compressed.messages, { role: "assistant", content }],
        };
    }
    const skillText = await fetchSkillText(meta.path);
    const systemContent = ["你是一个具备工具/技能注入能力的助手。以下内容是当前选中的 Skill，必须遵循。", skillText].join("\n\n");
    const promptMessages = [
        { role: "system", content: systemContent },
        ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
        ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
    const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
    return {
        chosen,
        skill: { name: meta.name, description: meta.description, path: meta.path, priority_group: meta.priority_group },
        used_skills: [meta.name],
        response: content,
        summary,
        summarized: compressed.summarized,
        messages: [...compressed.messages, { role: "assistant", content }],
    };
}
async function parseMultipart(req, maxBytes) {
    return await new Promise((resolve, reject) => {
        const fields = {};
        let fileResult = null;
        const bb = Busboy({
            headers: req.headers,
            limits: { fileSize: maxBytes, files: 1, fields: 100 },
        });
        bb.on("field", (name, value) => {
            if (typeof value === "string")
                fields[name] = value;
        });
        bb.on("file", (fieldname, file, info) => {
            const filename = info?.filename ? String(info.filename) : null;
            const mimeType = info?.mimeType ? String(info.mimeType) : null;
            const chunks = [];
            file.on("data", (d) => {
                chunks.push(d);
            });
            file.on("limit", () => reject(new Error("file too large")));
            file.on("end", () => {
                if (!fileResult) {
                    const data = Buffer.concat(chunks);
                    if (data.byteLength > maxBytes)
                        return reject(new Error("file too large"));
                    fileResult = { fieldname, filename, mimeType, data };
                }
            });
        });
        bb.on("error", (err) => reject(err));
        bb.on("finish", () => resolve({ fields, file: fileResult }));
        req.pipe(bb);
    });
}
async function handleDocumentsExtract(req, res) {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    const maxBytes = 15 * 1024 * 1024;
    if (ct.includes("multipart/form-data")) {
        const parsed = await parseMultipart(req, maxBytes);
        const file = parsed.file;
        if (!file || (file.fieldname !== "file" && file.fieldname !== "document")) {
            throw new Error("missing file field (file|document)");
        }
        const mimeType = resolveMimeType({
            provided: String(parsed.fields["mime_type"] || parsed.fields["mimeType"] || ""),
            fileMimeType: file.mimeType,
            filename: file.filename,
            data: file.data,
        });
        if (!mimeType)
            throw new Error("mime_type is required");
        const result = await extractBytes(file.data, mimeType);
        return sendJson(res, 200, { filename: file.filename, mime_type: mimeType, result });
    }
    if (ct.includes("application/json")) {
        const body = await readJsonBody(req, maxBytes);
        const filename = String(body?.filename || "upload");
        const base64 = body?.data_base64 || body?.dataBase64;
        if (!base64)
            throw new Error("data_base64 is required");
        const cleaned = String(base64 || "").trim().replace(/[\r\n\s]/g, "");
        let data;
        try {
            data = Buffer.from(cleaned, "base64");
        }
        catch {
            throw new Error("invalid base64");
        }
        if (data.byteLength > maxBytes)
            throw new Error("file too large");
        const mimeType = resolveMimeType({
            provided: String(body?.mime_type || body?.mimeType || ""),
            filename,
            data,
        });
        if (!mimeType)
            throw new Error("mime_type is required");
        const result = await extractBytes(data, mimeType);
        return sendJson(res, 200, { filename, mime_type: mimeType, result });
    }
    throw new Error("unsupported Content-Type");
}
async function servePublicFile(res, pathname) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    }
    catch {
        return null;
    }
    const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    if (!rel || rel.includes("..") || rel.includes("\\") || rel.includes("\0"))
        return null;
    const abs = path.resolve(PUBLIC_DIR, rel);
    const safeRel = path.relative(PUBLIC_DIR, abs);
    if (!safeRel || safeRel.startsWith("..") || path.isAbsolute(safeRel))
        return null;
    let data;
    try {
        data = await readFile(abs);
    }
    catch {
        return null;
    }
    const ext = path.extname(abs).toLowerCase();
    const ct = ext === ".html" || ext === ".htm"
        ? "text/html; charset=utf-8"
        : ext === ".js" || ext === ".mjs"
            ? "text/javascript; charset=utf-8"
            : ext === ".css"
                ? "text/css; charset=utf-8"
                : ext === ".json"
                    ? "application/json; charset=utf-8"
                    : "application/octet-stream";
    return sendText(res, 200, ct, data);
}
const VENDOR_ALLOW = {
    marked: ["lib/marked.esm.js"],
    dompurify: ["dist/purify.es.mjs"],
    "highlight.js": ["styles/github-dark.css"],
};
async function serveVendorFile(res, pathname) {
    if (!pathname.startsWith("/vendor/"))
        return null;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 3)
        return null;
    const pkg = parts[1];
    const rel = parts.slice(2).join("/");
    const allow = VENDOR_ALLOW[pkg];
    if (!allow || !allow.includes(rel))
        return null;
    const abs = path.resolve(NODE_MODULES_DIR, pkg, rel);
    const safeRel = path.relative(path.resolve(NODE_MODULES_DIR, pkg), abs);
    if (!safeRel || safeRel.startsWith("..") || path.isAbsolute(safeRel))
        return null;
    let data;
    try {
        data = await readFile(abs);
    }
    catch {
        return null;
    }
    const ext = path.extname(abs).toLowerCase();
    const ct = ext === ".js" || ext === ".mjs"
        ? "text/javascript; charset=utf-8"
        : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
    return sendText(res, 200, ct, data);
}
export async function handleRequest(req, res) {
    try {
        writeCorsHeaders(res);
        if (req.method === "OPTIONS") {
            const reqHeaders = String(req.headers["access-control-request-headers"] || "").trim();
            if (reqHeaders)
                res.setHeader("Access-Control-Allow-Headers", reqHeaders);
            res.statusCode = 204;
            return res.end();
        }
        const host = String(req.headers.host || "127.0.0.1");
        const url = new URL(req.url || "/", `http://${host}`);
        if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
            const served = await serveVendorFile(res, url.pathname);
            if (served !== null)
                return;
        }
        if (req.method === "GET") {
            const accept = String(req.headers.accept || "");
            if (url.pathname === "/" ? accept.includes("text/html") : true) {
                const served = await servePublicFile(res, url.pathname);
                if (served !== null)
                    return;
            }
        }
        if (req.method === "GET" && url.pathname === "/") {
            return sendJson(res, 200, {
                ok: true,
                endpoints: {
                    skills: { method: "GET", path: "/skills" },
                    choose: { method: "POST", path: "/choose", body: { query: "..." } },
                    run: { method: "POST", path: "/run", body: "application/json({query}) | multipart/form-data(query+file+mime_type)" },
                    documents_extract: { method: "POST", path: "/documents/extract", body: "multipart/form-data | application/json(base64)" },
                },
            });
        }
        if (req.method === "GET" && url.pathname === "/skills") {
            const catalog = await loadCatalog();
            return sendJson(res, 200, {
                skills: catalog.list.map((s) => ({ name: s.name, description: s.description, path: s.path, priority_group: s.priority_group })),
            });
        }
        if (req.method === "POST" && url.pathname === "/choose") {
            const body = await readJsonBody(req, 1024 * 1024);
            const query = String(body?.query ?? "");
            if (!query.trim())
                return sendJson(res, 400, { error: "query is required" });
            const config = getOpenAIConfigFromRequest(req);
            const hasSystemContentField = Object.prototype.hasOwnProperty.call(body || {}, "systemContent") || Object.prototype.hasOwnProperty.call(body || {}, "system_content");
            const systemContentFromBody = hasSystemContentField ? String(body?.systemContent ?? body?.system_content ?? "") : null;
            if (systemContentFromBody !== null)
                config.systemContent = systemContentFromBody.trim() ? systemContentFromBody : undefined;
            const chosen = await chooseSkill(config, query);
            return sendJson(res, 200, chosen);
        }
        if (req.method === "POST" && url.pathname === "/run") {
            const ct = String(req.headers["content-type"] || "").toLowerCase();
            if (ct.includes("multipart/form-data")) {
                const maxBytes = 15 * 1024 * 1024;
                const parsed = await parseMultipart(req, maxBytes);
                const query = String(parsed.fields["query"] || "").trim();
                if (!query)
                    return sendJson(res, 400, { error: "query is required" });
                let messages = null;
                if (parsed.fields["messages"]) {
                    try {
                        messages = JSON.parse(String(parsed.fields["messages"] || ""));
                    }
                    catch { }
                }
                const summary = String(parsed.fields["summary"] || "");
                const hasSystemContentField = Object.prototype.hasOwnProperty.call(parsed.fields, "systemContent") || Object.prototype.hasOwnProperty.call(parsed.fields, "system_content");
                const systemContentFromBody = hasSystemContentField ? String(parsed.fields["systemContent"] || parsed.fields["system_content"] || "") : null;
                const file = parsed.file;
                if (!file || (file.fieldname !== "file" && file.fieldname !== "document")) {
                    return sendJson(res, 400, { error: "missing file field (file|document)" });
                }
                const mimeType = resolveMimeType({
                    provided: String(parsed.fields["mime_type"] || parsed.fields["mimeType"] || ""),
                    fileMimeType: file.mimeType,
                    filename: file.filename,
                    data: file.data,
                });
                if (!mimeType)
                    return sendJson(res, 400, { error: "mime_type is required" });
                const extracted = await extractBytes(file.data, mimeType);
                const rawContent = String(extracted?.content || "");
                const maxChars = 60000;
                const content = rawContent.slice(0, maxChars);
                const doc = {
                    filename: file.filename,
                    mimeType,
                    content,
                    contentChars: rawContent.length,
                    truncated: rawContent.length > maxChars,
                };
                const config = getOpenAIConfigFromRequest(req);
                if (systemContentFromBody !== null)
                    config.systemContent = systemContentFromBody.trim() ? systemContentFromBody : undefined;
                const result = await runWithRouting(config, { query, messages, summary, doc });
                return sendJson(res, 200, { ...result, document: { filename: doc.filename, mime_type: doc.mimeType, content_chars: doc.contentChars, truncated: doc.truncated } });
            }
            const body = await readJsonBody(req, 2 * 1024 * 1024);
            const query = String(body?.query ?? "");
            const messages = body?.messages ?? null;
            const summary = String(body?.summary ?? "");
            const hasSystemContentField = Object.prototype.hasOwnProperty.call(body || {}, "systemContent") || Object.prototype.hasOwnProperty.call(body || {}, "system_content");
            const systemContentFromBody = hasSystemContentField ? String(body?.systemContent ?? body?.system_content ?? "") : null;
            const hasMessages = Array.isArray(messages) && messages.length;
            if (!query.trim() && !hasMessages)
                return sendJson(res, 400, { error: "query or messages is required" });
            const config = getOpenAIConfigFromRequest(req);
            if (systemContentFromBody !== null)
                config.systemContent = systemContentFromBody.trim() ? systemContentFromBody : undefined;
            const result = await runWithRouting(config, { query, messages, summary });
            return sendJson(res, 200, result);
        }
        if (req.method === "POST" && url.pathname === "/documents/extract") {
            try {
                return await handleDocumentsExtract(req, res);
            }
            catch (e) {
                return sendJson(res, 400, { error: String(e?.message || e) });
            }
        }
        return sendJson(res, 404, { error: "Not Found" });
    }
    catch (e) {
        return sendJson(res, 500, { error: String(e?.message || e) });
    }
}
