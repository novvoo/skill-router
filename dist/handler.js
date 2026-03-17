import path from "node:path";
import { readFile } from "node:fs/promises";
import Busboy from "busboy";
import { extractBytes, getEmbeddingPreset } from "@kreuzberg/node";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { ContextManager } from "./context/manager.js";
import { extractAndSaveMemories } from "./context/memory_extractor.js";
const contextManagers = new Map();
async function getContextManager(config, sessionId) {
    const key = sessionId || "default";
    let cm = contextManagers.get(key);
    if (!cm) {
        cm = new ContextManager(config, sessionId);
        await cm.ensureLoaded();
        contextManagers.set(key, cm);
    }
    return cm;
}
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-OpenAI-API-Key,X-OpenAI-Base-URL,X-OpenAI-Model,X-OpenAI-Embedding-Model,X-OpenAI-Default-Headers,X-OpenAI-System-Content,X-HF-Endpoint",
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
const EMBEDDING_PRESETS = ["fast", "balanced", "quality", "multilingual", "compact", "large", "accurate"];
const embeddingJobs = new Map();
const EMBEDDING_LOG_MAX = 200;
const EMBEDDING_LOG_TAIL = 30;
function getProcessingWarnings(result) {
    const arr = Array.isArray(result?.processingWarnings) ? result.processingWarnings : [];
    return arr
        .map((w) => ({ source: w?.source, message: w?.message }))
        .filter((w) => Boolean(String(w?.message || "").trim()));
}
function hasEmbeddingInitFailure(warnings) {
    for (const w of warnings) {
        if (String(w?.source || "").toLowerCase() !== "embedding")
            continue;
        const msg = String(w?.message || "");
        if (!msg)
            continue;
        if (msg.includes("Failed to initialize embedding model"))
            return msg;
        if (msg.toLowerCase().includes("plugin error") && msg.toLowerCase().includes("embeddings"))
            return msg;
    }
    return null;
}
function appendEmbeddingLog(job, message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    job.logs.push(line);
    if (job.logs.length > EMBEDDING_LOG_MAX)
        job.logs.splice(0, job.logs.length - EMBEDDING_LOG_MAX);
    console.log(line);
}
function normalizeHfEndpoint(raw) {
    const v0 = String(raw || "").trim();
    if (!v0)
        return null;
    const v = v0.replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/\/+$/g, "");
    if (!v)
        return null;
    if (v === "https://huggingface.co")
        return v;
    if (v === "https://hf-mirror.com")
        return v;
    return null;
}
function resolveKreuzbergCacheDir() {
    const cacheDirFromEnv = String(process.env.KREUZBERG_CACHE_DIR || "").trim();
    if (cacheDirFromEnv)
        return path.resolve(process.cwd(), cacheDirFromEnv);
    const preferred = path.resolve(process.cwd(), ".cache/models");
    const legacy = path.resolve(process.cwd(), ".cache");
    try {
        if (existsSync(preferred))
            return preferred;
        if (existsSync(legacy)) {
            const hasModels = readdirSync(legacy, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.startsWith("models--"));
            if (hasModels)
                return legacy;
        }
    }
    catch {
    }
    return preferred;
}
function hubCacheFromCacheDir(cacheDir) {
    const base = String(cacheDir || "").trim().toLowerCase().endsWith(`${path.sep}models`) ? path.dirname(cacheDir) : cacheDir;
    const root = path.resolve(base);
    return path.join(root, "huggingface", "hub");
}
function setHfCacheEnvForCacheDir(cacheDir) {
    const base = String(cacheDir || "").trim().toLowerCase().endsWith(`${path.sep}models`) ? path.dirname(cacheDir) : cacheDir;
    const root = path.resolve(base);
    process.env.XDG_CACHE_HOME = path.join(root, "xdg-cache");
    process.env.HF_HOME = path.join(root, "hf-home");
    const hubCache = path.join(root, "huggingface", "hub");
    process.env.HF_HUB_CACHE = hubCache;
    process.env.HUGGINGFACE_HUB_CACHE = hubCache;
    return hubCache;
}
function repairHfHubCache(cacheDir) {
    if (!existsSync(cacheDir))
        return;
    const repoDirs = readdirSync(cacheDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith("models--"))
        .map((d) => path.join(cacheDir, d.name));
    for (const repoDir of repoDirs) {
        const refPath = path.join(repoDir, "refs", "main");
        if (!existsSync(refPath)) {
            const hasFlatLayout = existsSync(path.join(repoDir, "config.json")) && existsSync(path.join(repoDir, "tokenizer.json"));
            if (hasFlatLayout) {
                const commitHash = "0000000000000000000000000000000000000000";
                mkdirSync(path.dirname(refPath), { recursive: true });
                writeFileSync(refPath, commitHash + "\n");
                const snapshotDir = path.join(repoDir, "snapshots", commitHash);
                mkdirSync(snapshotDir, { recursive: true });
            }
        }
        if (!existsSync(refPath))
            continue;
        const commitHash = String(readFileSync(refPath, "utf-8")).trim();
        if (!commitHash)
            continue;
        const snapshotDir = path.join(repoDir, "snapshots", commitHash);
        if (existsSync(snapshotDir)) {
            const maybeCopy = (rel) => {
                const src = path.join(repoDir, rel);
                const dst = path.join(snapshotDir, rel);
                if (!existsSync(src))
                    return;
                if (existsSync(dst))
                    return;
                mkdirSync(path.dirname(dst), { recursive: true });
                copyFileSync(src, dst);
            };
            for (const rel of ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt"]) {
                maybeCopy(rel);
            }
            const onnxDir = path.join(repoDir, "onnx");
            if (existsSync(onnxDir)) {
                const snapshotOnnxDir = path.join(snapshotDir, "onnx");
                mkdirSync(snapshotOnnxDir, { recursive: true });
                for (const ent of readdirSync(onnxDir, { withFileTypes: true })) {
                    if (!ent.isFile())
                        continue;
                    const src = path.join(onnxDir, ent.name);
                    const dst = path.join(snapshotOnnxDir, ent.name);
                    if (!existsSync(dst))
                        copyFileSync(src, dst);
                }
            }
        }
        const pointerPath = path.join(repoDir, "snapshots", commitHash, "onnx", "model.onnx");
        if (existsSync(pointerPath))
            continue;
        const blobsDir = path.join(repoDir, "blobs");
        if (!existsSync(blobsDir))
            continue;
        const blobCandidates = readdirSync(blobsDir, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => path.join(blobsDir, d.name))
            .filter((p) => {
            const ext = path.extname(p).toLowerCase();
            return ext !== ".lock" && ext !== ".part";
        });
        if (blobCandidates.length === 0)
            continue;
        let bestBlob = blobCandidates[0];
        let bestSize = -1;
        for (const p of blobCandidates) {
            try {
                const size = statSync(p).size;
                if (size > bestSize) {
                    bestSize = size;
                    bestBlob = p;
                }
            }
            catch {
            }
        }
        mkdirSync(path.dirname(pointerPath), { recursive: true });
        copyFileSync(bestBlob, pointerPath);
    }
}
function hasHfModelFiles(cacheDir, modelName) {
    const hasModelAt = (p) => {
        if (!existsSync(path.join(p, "config.json")))
            return false;
        if (!existsSync(path.join(p, "tokenizer.json")))
            return false;
        const onnxDir = path.join(p, "onnx");
        if (!existsSync(onnxDir))
            return false;
        try {
            return readdirSync(onnxDir, { withFileTypes: true }).some((ent) => ent.isFile() && ent.name.toLowerCase().endsWith(".onnx"));
        }
        catch {
            return false;
        }
    };
    const candidates = [];
    for (const modelCacheDir of modelCacheDirCandidates(cacheDir, modelName)) {
        const snapshotsDir = path.join(modelCacheDir, "snapshots");
        if (existsSync(snapshotsDir)) {
            try {
                for (const s of readdirSync(snapshotsDir))
                    candidates.push(path.join(snapshotsDir, s));
            }
            catch {
            }
        }
        candidates.push(modelCacheDir);
    }
    return candidates.some(hasModelAt);
}
function hasAnyHfModelFiles(cacheDir) {
    let ents = [];
    try {
        ents = readdirSync(cacheDir, { withFileTypes: true });
    }
    catch {
        return false;
    }
    const modelDirs = ents.filter((d) => d?.isDirectory?.() && String(d.name || "").startsWith("models--")).map((d) => path.join(cacheDir, d.name));
    if (!modelDirs.length)
        return false;
    const hasModelAt = (p) => {
        if (!existsSync(path.join(p, "config.json")))
            return false;
        if (!existsSync(path.join(p, "tokenizer.json")))
            return false;
        const onnxDir = path.join(p, "onnx");
        if (!existsSync(onnxDir))
            return false;
        try {
            return readdirSync(onnxDir, { withFileTypes: true }).some((ent) => ent.isFile() && ent.name.toLowerCase().endsWith(".onnx"));
        }
        catch {
            return false;
        }
    };
    for (const base of modelDirs) {
        const snapshotsDir = path.join(base, "snapshots");
        if (existsSync(snapshotsDir)) {
            try {
                for (const s of readdirSync(snapshotsDir)) {
                    if (hasModelAt(path.join(snapshotsDir, s)))
                        return true;
                }
            }
            catch {
            }
        }
        if (hasModelAt(base))
            return true;
    }
    return false;
}
function modelCacheDirCandidates(cacheDir, modelName) {
    const out = [];
    const add = (rel) => {
        const abs = path.resolve(cacheDir, rel);
        const safeRel = path.relative(cacheDir, abs);
        if (!safeRel || safeRel.startsWith("..") || path.isAbsolute(safeRel))
            return;
        out.push(abs);
    };
    const encoded = String(modelName || "").replace("/", "--");
    add("models--" + encoded);
    add("models--sentence-transformers--" + encoded);
    add("models--sentence-transformers--" + encoded.toLowerCase());
    add("models--" + encoded.toLowerCase());
    return [...new Set(out)];
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
        if (key === "x-hf-endpoint")
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
    const headerEmbeddingModel = String(req.headers["x-openai-embedding-model"] || "");
    const headerDefaultHeaders = String(req.headers["x-openai-default-headers"] || "");
    const headerSystemContent = String(req.headers["x-openai-system-content"] || "");
    const headerHfEndpoint = String(req.headers["x-hf-endpoint"] || "");
    const apiKey = headerKey || String(process.env.OPENAI_API_KEY || "");
    const baseUrl = (headerBase || String(process.env.OPENAI_BASE_URL || "")).trim();
    const model = (headerModel || String(process.env.OPENAI_MODEL || "")).trim();
    const embeddingModel = (headerEmbeddingModel || String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small")).trim();
    const hfEndpoint = normalizeHfEndpoint(headerHfEndpoint) || undefined;
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
    return { apiKey, baseUrl, model, embeddingModel, hfEndpoint, defaultHeaders, systemContent };
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
function stripDocumentBlockFromUserContent(userContent) {
    const s = String(userContent || "");
    const i = s.indexOf("\n---\n用户上传的参考文档");
    return (i >= 0 ? s.slice(0, i) : s).trim();
}
function stripDocumentBlocksForRouting(messages) {
    return messages.map((m) => (m.role === "user" ? { ...m, content: stripDocumentBlockFromUserContent(m.content) } : m));
}
function isLikelyTestAddressQuery(query) {
    const q = String(query || "").toLowerCase();
    return /测试(地址|链接|环境|域名|url)|体验(地址|链接)|demo(地址|链接)?|test\s*(url|address|link)|staging|sandbox|预发|灰度|uat|qa|dev/.test(q);
}
function extractUrlsFromText(text) {
    const s = String(text || "");
    const urls = new Set();
    const re = /(https?:\/\/[^\s"'<>]+)|((?:www\.)[^\s"'<>]+)|((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{2,5})?(?:\/[^\s"'<>]*)?)/g;
    for (const m of s.matchAll(re)) {
        const raw = String(m[0] || "").trim();
        const cleaned = raw.replace(/[),.;!?，。；！？】】》》]+$/g, "").replace(/^[【《(]+/g, "");
        if (cleaned)
            urls.add(cleaned);
        if (urls.size >= 30)
            break;
    }
    return [...urls];
}
function buildTestAddressResponseFromDocContent(docContent) {
    const urls = extractUrlsFromText(docContent);
    if (!urls.length) {
        return "我在文档提取文本里没有找到可识别的链接/地址（如 http(s):// 或域名:端口）。文档可能没有提供测试地址；如果你确认文档里有，请把包含“测试地址”的那一页截图/原文粘贴出来，我再精确定位。";
    }
    const scored = urls
        .map((u) => {
        const lu = u.toLowerCase();
        const score = (lu.includes("test") ? 3 : 0) +
            (lu.includes("staging") ? 3 : 0) +
            (lu.includes("sandbox") ? 3 : 0) +
            (lu.includes("uat") ? 2 : 0) +
            (lu.includes("qa") ? 2 : 0) +
            (lu.includes("dev") ? 2 : 0) +
            (lu.includes("pre") ? 1 : 0) +
            (lu.includes("demo") ? 1 : 0);
        return { url: u, score };
    })
        .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
        .map((x) => x.url);
    const top = scored.slice(0, 15);
    const lines = String(docContent || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const context = top
        .map((u) => {
        const line = lines.find((l) => l.includes(u)) || "";
        return line ? `- ${line}` : "";
    })
        .filter(Boolean)
        .slice(0, 8);
    return [
        "文档里出现的链接/地址如下（是否为“测试地址”需结合文档上下文判断）：",
        ...top.map((u) => `- ${u}`),
        context.length ? "" : "",
        context.length ? "相关原文行（便于判断用途）：" : "",
        ...context,
        "",
        "如果你要找“测试环境/沙箱/预发”地址：优先看包含 test / staging / sandbox / uat / qa / dev 的链接，或紧邻“测试/沙箱/预发”等字样的行。",
    ]
        .filter(Boolean)
        .join("\n");
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
function formatContext(nodes) {
    if (!nodes.length)
        return "";
    const lines = ["[相关上下文/记忆]"];
    for (const node of nodes) {
        lines.push(`- [${node.type}] ${node.path} (Score: ${node.score?.toFixed(2)})`);
        lines.push(`  摘要: ${node.summary}`);
        if (node.level === "L2" && node.content) {
            lines.push(`  详情: ${node.content.slice(0, 500)}...`); // Truncate L2
        }
    }
    return lines.join("\n");
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
    // Retrieve context
    const sessionId = args.messages?.[0]?.sessionId || undefined;
    const cm = await getContextManager(config, sessionId);
    const lastUserWithDoc = [...compressed.messages].reverse().find((m) => m.role === "user")?.content || fallbackQuery;
    const lastUser = stripDocumentBlockFromUserContent(lastUserWithDoc);
    const retrieval = await cm.search(lastUser, { maxResults: 3 });
    const rawEmbeddingModel = String(config.embeddingModel || "").trim();
    const lowerEmbeddingModel = rawEmbeddingModel.toLowerCase();
    const presetSet = new Set(["fast", "balanced", "quality", "multilingual", "compact", "large", "accurate"]);
    const normalizedPreset = lowerEmbeddingModel === "preset" || lowerEmbeddingModel === "kreuzberg"
        ? "fast"
        : lowerEmbeddingModel.startsWith("preset:") || lowerEmbeddingModel.startsWith("preset/")
            ? lowerEmbeddingModel.slice(7).trim()
            : lowerEmbeddingModel.startsWith("kreuzberg:") || lowerEmbeddingModel.startsWith("kreuzberg/")
                ? lowerEmbeddingModel.slice(10).trim()
                : lowerEmbeddingModel;
    const embeddingUsesKreuzberg = presetSet.has(normalizedPreset);
    const cacheDirFromEnv = String(process.env.KREUZBERG_CACHE_DIR || "").trim();
    const embeddingCacheDir = path.resolve(process.cwd(), cacheDirFromEnv || ".cache/models");
    const embeddingDims = (() => {
        switch (normalizedPreset) {
            case "fast":
            case "compact":
                return 384;
            case "balanced":
                return 768;
            case "quality":
            case "large":
            case "accurate":
            case "multilingual":
                return 1024;
            default:
                return null;
        }
    })();
    if (doc && isLikelyTestAddressQuery(lastUser)) {
        const response = buildTestAddressResponseFromDocContent(doc.content);
        void extractAndSaveMemories(config, cm, [...compressed.messages, { role: "assistant", content: response }]);
        void cm.persistSession([...compressed.messages, { role: "assistant", content: response }], summary);
        return {
            chosen: { skill: "none", confidence: 1.0, reason: "检测到“测试地址/链接”类问题，使用确定性链接抽取避免跑题" },
            skill: null,
            used_skills: [],
            response,
            summary,
            summarized: compressed.summarized,
            messages: [...compressed.messages, { role: "assistant", content: response }],
            retrieval_trajectory: retrieval.trajectory,
            retrieved_nodes: retrieval.nodes.map(n => ({ path: n.path, type: n.type, score: n.score })),
            memory: { retrieval_called: true, retrieved_count: retrieval.nodes.length, used_in_prompt: false },
            models: {
                chat: config.model,
                embedding: embeddingUsesKreuzberg
                    ? {
                        provider: "kreuzberg",
                        model_type: "preset",
                        preset: normalizedPreset,
                        dimensions: embeddingDims,
                        cache_dir: embeddingCacheDir,
                        hf_endpoint: process.env.HF_ENDPOINT || null,
                    }
                    : {
                        provider: "openai_compatible",
                        model: rawEmbeddingModel || "text-embedding-3-small",
                    },
            },
        };
    }
    const contextText = formatContext(retrieval.nodes);
    const routingDocSnippet = doc?.content ? doc.content.slice(0, 2000) : "";
    const routingMessages = stripDocumentBlocksForRouting(compressed.messages);
    const routingParts = [
        lastUser,
        summary ? `\n\n[对话摘要]\n${summary}` : "",
        routingMessages.length ? `\n\n[最近对话]\n${buildTranscript(routingMessages.slice(-8), 3000)}` : "",
        doc ? `\n\n[用户上传文档节选]\n${routingDocSnippet}` : "",
        contextText ? `\n\n${contextText}` : "",
    ].filter(Boolean);
    const chosen = await chooseSkill(config, routingParts.join(""));
    const extraFields = {
        retrieval_trajectory: retrieval.trajectory,
        retrieved_nodes: retrieval.nodes.map(n => ({ path: n.path, type: n.type, score: n.score })),
        memory: {
            retrieval_called: true,
            retrieved_count: retrieval.nodes.length,
            used_in_prompt: Boolean(contextText),
        },
        models: {
            chat: config.model,
            embedding: embeddingUsesKreuzberg
                ? {
                    provider: "kreuzberg",
                    model_type: "preset",
                    preset: normalizedPreset,
                    dimensions: embeddingDims,
                    cache_dir: embeddingCacheDir,
                    hf_endpoint: process.env.HF_ENDPOINT || null,
                }
                : {
                    provider: "openai_compatible",
                    model: rawEmbeddingModel || "text-embedding-3-small",
                },
        },
    };
    if (chosen.skill === "none") {
        const docPolicy = doc
            ? "如果用户上传了参考文档：优先回答用户当前问题；除非用户明确要求“总结/概览/摘要”，否则不要对文档做整体总结；当用户询问地址/链接/URL（尤其测试地址、沙箱/预发环境）时，只能返回文档中真实出现的链接/域名，找不到就明确说明未提供。"
            : "";
        const promptMessages = [
            { role: "system", content: "你是一个有帮助的助手。" },
            ...(docPolicy ? [{ role: "system", content: docPolicy }] : []),
            ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
            ...(contextText ? [{ role: "system", content: contextText }] : []),
            ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
        const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
        // Async memory extraction
        void extractAndSaveMemories(config, cm, [...compressed.messages, { role: "assistant", content }]);
        // Async session persistence
        void cm.persistSession([...compressed.messages, { role: "assistant", content }], summary);
        return {
            chosen,
            skill: null,
            used_skills: [],
            response: content,
            summary,
            summarized: compressed.summarized,
            messages: [...compressed.messages, { role: "assistant", content }],
            ...extraFields,
        };
    }
    const meta = catalog.byName.get(chosen.skill) || null;
    if (!meta) {
        const docPolicy = doc
            ? "如果用户上传了参考文档：优先回答用户当前问题；除非用户明确要求“总结/概览/摘要”，否则不要对文档做整体总结；当用户询问地址/链接/URL（尤其测试地址、沙箱/预发环境）时，只能返回文档中真实出现的链接/域名，找不到就明确说明未提供。"
            : "";
        const promptMessages = [
            { role: "system", content: "你是一个有帮助的助手。" },
            ...(docPolicy ? [{ role: "system", content: docPolicy }] : []),
            ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
            ...(contextText ? [{ role: "system", content: contextText }] : []),
            ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
        const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
        // Async memory extraction
        void extractAndSaveMemories(config, cm, [...compressed.messages, { role: "assistant", content }]);
        // Async session persistence
        void cm.persistSession([...compressed.messages, { role: "assistant", content }], summary);
        return {
            chosen,
            skill: null,
            used_skills: [],
            response: content,
            summary,
            summarized: compressed.summarized,
            messages: [...compressed.messages, { role: "assistant", content }],
            ...extraFields,
        };
    }
    const skillText = await fetchSkillText(meta.path);
    const systemContent = ["你是一个具备工具/技能注入能力的助手。以下内容是当前选中的 Skill，必须遵循。", skillText].join("\n\n");
    const docPolicy = doc
        ? "如果用户上传了参考文档：优先回答用户当前问题；除非用户明确要求“总结/概览/摘要”，否则不要对文档做整体总结；当用户询问地址/链接/URL（尤其测试地址、沙箱/预发环境）时，只能返回文档中真实出现的链接/域名，找不到就明确说明未提供。"
        : "";
    const promptMessages = [
        { role: "system", content: systemContent },
        ...(docPolicy ? [{ role: "system", content: docPolicy }] : []),
        ...(summary ? [{ role: "system", content: `对话摘要：\n${summary}` }] : []),
        ...(contextText ? [{ role: "system", content: contextText }] : []),
        ...compressed.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const result = await chatCompletions(config, { messages: promptMessages, temperature: 0.2 });
    const content = stripLeadingSkillAnnouncements(result.content, catalog.byName);
    // Async memory extraction
    void extractAndSaveMemories(config, cm, [...compressed.messages, { role: "assistant", content }]);
    // Async session persistence
    void cm.persistSession([...compressed.messages, { role: "assistant", content }], summary);
    return {
        chosen,
        skill: { name: meta.name, description: meta.description, path: meta.path, priority_group: meta.priority_group },
        used_skills: [meta.name],
        response: content,
        summary,
        summarized: compressed.summarized,
        messages: [...compressed.messages, { role: "assistant", content }],
        ...extraFields,
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
        const uint8Array = new Uint8Array(file.data);
        const result = await extractBytes(uint8Array, mimeType);
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
        const uint8Array = new Uint8Array(data);
        const result = await extractBytes(uint8Array, mimeType);
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
                    memories: { method: "GET,POST,DELETE", path: "/memories" },
                    embeddings_status: { method: "GET", path: "/embeddings/status" },
                    embeddings_download: { method: "POST", path: "/embeddings/download", body: { preset: "fast", hf_endpoint: "https://hf-mirror.com", force: false } },
                },
            });
        }
        if (req.method === "GET" && url.pathname === "/embeddings/status") {
            const cacheDir = resolveKreuzbergCacheDir();
            const hubCache = hubCacheFromCacheDir(cacheDir);
            try {
                repairHfHubCache(cacheDir);
            }
            catch {
            }
            try {
                repairHfHubCache(hubCache);
            }
            catch {
            }
            const hfEndpoint = process.env.HF_ENDPOINT || null;
            const anyDownloaded = hasAnyHfModelFiles(cacheDir) || hasAnyHfModelFiles(hubCache);
            const presets = EMBEDDING_PRESETS.map((preset) => {
                const info = getEmbeddingPreset(preset);
                const modelName = info?.modelName ? String(info.modelName) : null;
                const dimensions = Number.isFinite(Number(info?.dimensions)) ? Number(info.dimensions) : null;
                const downloaded = modelName
                    ? hasHfModelFiles(cacheDir, modelName) || hasHfModelFiles(hubCache, modelName) || anyDownloaded
                    : anyDownloaded;
                const existing = embeddingJobs.get(preset);
                let status = downloaded ? "downloaded" : "not_downloaded";
                let error;
                if (existing) {
                    status = existing.status;
                    error = existing.error;
                    if (downloaded && status !== "downloading") {
                        status = "downloaded";
                        error = undefined;
                        existing.status = "downloaded";
                        existing.error = undefined;
                        existing.updated_at = Date.now();
                    }
                }
                const logTail = existing?.logs?.length ? existing.logs.slice(-EMBEDDING_LOG_TAIL).join("\n") : "";
                return { preset, model_name: modelName, dimensions, status, error, log_tail: logTail || undefined };
            });
            return sendJson(res, 200, { cache_dir: cacheDir, hub_cache_dir: hubCache, hf_endpoint: hfEndpoint, presets });
        }
        if (req.method === "POST" && url.pathname === "/embeddings/download") {
            const body = await readJsonBody(req, 1024 * 1024);
            const presetRaw = String(body?.preset ?? body?.type ?? "").trim().toLowerCase();
            const preset = EMBEDDING_PRESETS.find((p) => p === presetRaw) || null;
            if (!preset)
                return sendJson(res, 400, { error: `invalid preset: ${presetRaw || "(empty)"}` });
            const force = Boolean(body?.force);
            const requestedHfEndpoint = normalizeHfEndpoint(body?.hf_endpoint ?? body?.hfEndpoint ?? req.headers["x-hf-endpoint"]);
            if (requestedHfEndpoint)
                process.env.HF_ENDPOINT = requestedHfEndpoint;
            const hfEndpoint = process.env.HF_ENDPOINT || null;
            const cacheDir = resolveKreuzbergCacheDir();
            try {
                mkdirSync(cacheDir, { recursive: true });
            }
            catch {
            }
            try {
                repairHfHubCache(cacheDir);
            }
            catch {
            }
            const info = getEmbeddingPreset(preset);
            const modelName = info?.modelName ? String(info.modelName) : null;
            const dimensions = Number.isFinite(Number(info?.dimensions)) ? Number(info.dimensions) : null;
            const existing = embeddingJobs.get(preset);
            if (existing && existing.status === "downloading") {
                appendEmbeddingLog(existing, `[embeddings] already downloading preset=${preset} model=${existing.model_name || "(unknown)"} cache=${existing.cache_dir}`);
                return sendJson(res, 202, { ok: true, job: existing });
            }
            const now = Date.now();
            const job = {
                preset,
                model_name: modelName,
                dimensions,
                cache_dir: cacheDir,
                hf_endpoint: hfEndpoint,
                status: "not_downloaded",
                logs: [],
                started_at: now,
                updated_at: now,
            };
            appendEmbeddingLog(job, `[embeddings] download request preset=${preset} model=${modelName || "(unknown)"} dims=${dimensions || "(unknown)"} cache=${cacheDir} hf=${hfEndpoint || "(default)"} force=${force ? "1" : "0"}`);
            if (force && modelName) {
                const hubCache = hubCacheFromCacheDir(cacheDir);
                const modelDirs = [...modelCacheDirCandidates(cacheDir, modelName), ...modelCacheDirCandidates(hubCache, modelName)];
                for (const modelDir of [...new Set(modelDirs)]) {
                    try {
                        appendEmbeddingLog(job, `[embeddings] force=1 removing cache dir: ${modelDir}`);
                        rmSync(modelDir, { recursive: true, force: true });
                    }
                    catch (e) {
                        appendEmbeddingLog(job, `[embeddings] force remove failed: ${String(e?.message || e)}`);
                    }
                }
            }
            const hubCacheForCheck = hubCacheFromCacheDir(cacheDir);
            if (!force && modelName && (hasHfModelFiles(cacheDir, modelName) || hasHfModelFiles(hubCacheForCheck, modelName))) {
                job.status = "downloaded";
                job.updated_at = Date.now();
                embeddingJobs.set(preset, job);
                appendEmbeddingLog(job, `[embeddings] already downloaded preset=${preset} model=${modelName}`);
                return sendJson(res, 200, {
                    ok: true,
                    preset,
                    model_name: modelName,
                    dimensions,
                    cache_dir: cacheDir,
                    hf_endpoint: hfEndpoint,
                    status: "downloaded",
                });
            }
            job.status = "downloading";
            embeddingJobs.set(preset, job);
            void (async () => {
                const startedAt = Date.now();
                let ticker = null;
                try {
                    appendEmbeddingLog(job, `[embeddings] downloading... preset=${preset}`);
                    ticker = setInterval(() => {
                        appendEmbeddingLog(job, `[embeddings] downloading... still running preset=${preset}`);
                    }, 5000);
                    if (job.hf_endpoint)
                        process.env.HF_ENDPOINT = job.hf_endpoint;
                    const hubCache = setHfCacheEnvForCacheDir(cacheDir);
                    const u8 = new Uint8Array(Buffer.from("warmup", "utf-8"));
                    const result = await extractBytes(u8, "text/plain", {
                        embeddings: true,
                        chunking: {
                            maxChars: 100000,
                            maxOverlap: 0,
                            embedding: {
                                model: { modelType: "preset", value: preset },
                                cacheDir,
                                showDownloadProgress: true,
                            },
                        },
                    });
                    try {
                        repairHfHubCache(cacheDir);
                    }
                    catch {
                    }
                    try {
                        repairHfHubCache(hubCache);
                    }
                    catch {
                    }
                    const warnings = getProcessingWarnings(result);
                    for (const w of warnings) {
                        appendEmbeddingLog(job, `[embeddings] warning source=${w.source || "(unknown)"} msg=${String(w.message || "").slice(0, 500)}`);
                    }
                    const initFailure = hasEmbeddingInitFailure(warnings);
                    if (initFailure)
                        throw new Error(initFailure);
                    const detected = modelName ? hasHfModelFiles(cacheDir, modelName) : hasAnyHfModelFiles(cacheDir);
                    const detectedAny = detected || (modelName ? hasHfModelFiles(hubCache, modelName) : hasAnyHfModelFiles(hubCache));
                    if (!detectedAny) {
                        throw new Error(`cache files not detected after download (model=${modelName || "(unknown)"}, cache=${cacheDir}, hub_cache=${hubCache})`);
                    }
                    job.status = "downloaded";
                    job.error = undefined;
                }
                catch (e) {
                    job.status = "error";
                    job.error = String(e?.message || e);
                }
                finally {
                    if (ticker)
                        clearInterval(ticker);
                    job.updated_at = Date.now();
                    const ms = job.updated_at - startedAt;
                    appendEmbeddingLog(job, `[embeddings] download done preset=${preset} status=${job.status} ms=${ms}${job.error ? ` err=${job.error}` : ""}`);
                }
            })();
            return sendJson(res, 202, { ok: true, job });
        }
        if (req.method === "GET" && url.pathname === "/memories") {
            const config = getOpenAIConfigFromRequest(req);
            const sessionId = url.searchParams.get("sessionId") || undefined;
            const cm = await getContextManager(config, sessionId);
            let path = url.searchParams.get("path") || "/user";
            const tree = url.searchParams.get("tree");
            // Security: Only allow access to /user path
            if (!path.startsWith("/user") && path !== "/") {
                path = "/user";
            }
            if (tree === "true") {
                const fullTree = cm.getTree();
                // Filter tree to only show /user branch
                // For session isolation, if we have a sessionId, the tree structure might be different
                // But getTree returns the full VFS.
                // If isolated, the VFS is already scoped or contains the specific user path.
                // Let's just return the relevant branch.
                const userBranch = fullTree.children?.find((c) => c.path.startsWith("/user"));
                return sendJson(res, 200, userBranch || { path: "/user", children: [] });
            }
            const nodes = cm.list(path);
            return sendJson(res, 200, {
                path,
                children: nodes.map((n) => ({
                    path: n.path,
                    type: n.type,
                    level: n.level,
                    summary: n.summary,
                    hasContent: !!n.content,
                    metadata: n.metadata,
                    childCount: n.children?.length || 0,
                })),
            });
        }
        if (req.method === "POST" && url.pathname === "/memories") {
            const config = getOpenAIConfigFromRequest(req);
            const body = await readJsonBody(req, 1024 * 1024);
            const sessionId = body.sessionId || undefined;
            const cm = await getContextManager(config, sessionId);
            const path = String(body.path || "").trim();
            const content = String(body.content || "").trim();
            const summary = String(body.summary || "").trim();
            if (!path || !content) {
                return sendJson(res, 400, { error: "path and content are required" });
            }
            // Security: Only allow adding to /user path
            if (!path.startsWith("/user/")) {
                return sendJson(res, 403, { error: "Only memories under /user/ can be added" });
            }
            await cm.addMemory(path, content, summary);
            return sendJson(res, 200, { ok: true, path });
        }
        if (req.method === "DELETE" && url.pathname === "/memories") {
            const config = getOpenAIConfigFromRequest(req);
            const body = await readJsonBody(req, 1024 * 1024);
            const sessionId = body.sessionId || undefined;
            const cm = await getContextManager(config, sessionId);
            const path = String(body.path || "").trim();
            if (!path) {
                return sendJson(res, 400, { error: "path is required" });
            }
            // Security: Only allow deleting from /user path
            if (!path.startsWith("/user/")) {
                return sendJson(res, 403, { error: "Only memories under /user/ can be deleted" });
            }
            const deleted = await cm.deleteMemory(path);
            if (!deleted) {
                return sendJson(res, 404, { error: "Memory not found" });
            }
            return sendJson(res, 200, { ok: true, path });
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
                const uint8Array = new Uint8Array(file.data);
                const extracted = await extractBytes(uint8Array, mimeType);
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
