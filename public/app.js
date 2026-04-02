import { marked } from "/vendor/marked/lib/marked.esm.js";
import DOMPurify from "/vendor/dompurify/dist/purify.es.mjs";
import hljs from "/vendor/highlight.js/es/common.js";
import { toolProgressTracker } from "/src/utils/toolProgress.js";

const KEY = "skill-router:openai";
const SESSION_KEY = "skill-router:session_id";
const EMBEDDING_OPTIONS = new Set([
  "",
  "fast",
  "balanced",
  "quality",
  "multilingual",
  "compact",
  "large",
  "accurate",
]);
const HF_ENDPOINT_OPTIONS = new Set(["", "https://huggingface.co", "https://hf-mirror.com"]);
const OCR_BACKEND_OPTIONS = new Set(["", "tesseract", "guten-ocr"]);

function getSessionId() {
  if (getSessionId._mem) return getSessionId._mem;
  let sid = "";
  try {
    sid = String(localStorage.getItem(SESSION_KEY) || "");
  } catch {
    sid = "";
  }
  if (!sid) {
    sid = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      localStorage.setItem(SESSION_KEY, sid);
    } catch {
    }
  }
  getSessionId._mem = sid;
  return sid;
}
getSessionId._mem = "";

function safeLinkHref(href) {
  if (typeof href !== "string") return "";
  const raw = href.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return u.toString();
  } catch {}
  return "";
}

const mdRenderer = new marked.Renderer();
mdRenderer.link = (...args) => {
  let href, title, text;
  if (args[0] && typeof args[0] === "object") {
    href = args[0].href;
    title = args[0].title;
    text = args[0].text ?? args[0].href ?? "";
  } else {
    [href, title, text] = args;
  }
  const safeHref = safeLinkHref(href);
  const safeTitle = title ? String(title) : "";
  const t = String(text || "");
  if (!safeHref) return t;
  const titleAttr = safeTitle ? ` title="${safeTitle.replaceAll('"', "&quot;")}"` : "";
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${t}</a>`;
};

marked.setOptions({ gfm: true, breaks: true, renderer: mdRenderer });

function renderMarkdownToHtml(text) {
  const raw = marked.parse(String(text || ""));
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

function highlightIn(el) {
  if (!el) return;
  const codes = el.querySelectorAll("pre code");
  for (const code of codes) hljs.highlightElement(code);
}

function loadCfg() {
  try {
    const local = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    const rawEmbeddingModel = String(local.embeddingModel || "").trim();
    const lowered = rawEmbeddingModel.toLowerCase();
    let normalizedEmbeddingModel = rawEmbeddingModel;
    if (lowered === "preset" || lowered === "kreuzberg") normalizedEmbeddingModel = "fast";
    if (lowered.startsWith("preset:") || lowered.startsWith("preset/")) normalizedEmbeddingModel = lowered.slice(7).trim();
    if (lowered.startsWith("kreuzberg:") || lowered.startsWith("kreuzberg/")) normalizedEmbeddingModel = lowered.slice(10).trim();
    if (!EMBEDDING_OPTIONS.has(String(normalizedEmbeddingModel || ""))) normalizedEmbeddingModel = "";
    local.embeddingModel = normalizedEmbeddingModel;
    const rawHfEndpoint = String(local.hfEndpoint || "").trim();
    local.hfEndpoint = HF_ENDPOINT_OPTIONS.has(rawHfEndpoint) ? rawHfEndpoint : "";
    const rawOcrBackend = String(local.ocrBackend || "").trim().toLowerCase();
    local.ocrBackend = OCR_BACKEND_OPTIONS.has(rawOcrBackend) ? rawOcrBackend : "";
    local.ocrLanguage = String(local.ocrLanguage || "").trim();
    if (typeof local.ocrAutoDownload !== "boolean") {
      const raw = String(local.ocrAutoDownload ?? "").trim().toLowerCase();
      local.ocrAutoDownload = raw ? !(raw === "0" || raw === "false" || raw === "off" || raw === "no") : false;
    }
    if (typeof local.memoryEnabled !== "boolean") {
      const raw = String(local.memoryEnabled ?? "").trim().toLowerCase();
      local.memoryEnabled = !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
    }
    return local;
  } catch {
    return {};
  }
}

function saveCfg(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg || {}));
  } catch {}
}

function clearCfg() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

function normalizeCustomHeaders(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((it) => ({ key: String(it?.key ?? it?.name ?? it?.header ?? "").trim(), value: String(it?.value ?? "").trim() }))
      .filter((it) => it.key || it.value);
  }
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];
    try {
      return normalizeCustomHeaders(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (typeof input === "object") {
    return Object.entries(input)
      .map(([k, v]) => ({ key: String(k || "").trim(), value: String(v ?? "").trim() }))
      .filter((it) => it.key || it.value);
  }
  return [];
}

function customHeadersFromTable() {
  const body = document.getElementById("customHeadersBody");
  if (!body) return [];
  const rows = [];
  for (const tr of body.querySelectorAll("tr")) {
    const key = tr.querySelector('input[data-field="key"]')?.value ?? "";
    const value = tr.querySelector('input[data-field="value"]')?.value ?? "";
    const k = String(key || "").trim();
    const v = String(value ?? "").trim();
    if (!k && !v) continue;
    rows.push({ key: k, value: v });
  }
  return rows;
}

function addCustomHeaderRow(key = "", value = "") {
  const body = document.getElementById("customHeadersBody");
  if (!body) return;
  const tr = document.createElement("tr");

  const tdKey = document.createElement("td");
  const inKey = document.createElement("input");
  inKey.type = "text";
  inKey.placeholder = "X-Custom";
  inKey.value = String(key || "");
  inKey.setAttribute("data-field", "key");
  tdKey.appendChild(inKey);

  const tdValue = document.createElement("td");
  const inValue = document.createElement("input");
  inValue.type = "text";
  inValue.placeholder = "foo";
  inValue.value = String(value || "");
  inValue.setAttribute("data-field", "value");
  tdValue.appendChild(inValue);

  const tdRm = document.createElement("td");
  tdRm.style.textAlign = "right";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary hdrRmBtn";
  btn.textContent = "×";
  btn.addEventListener("click", () => {
    tr.remove();
    const remaining = body.querySelectorAll("tr").length;
    if (!remaining) addCustomHeaderRow("", "");
  });
  tdRm.appendChild(btn);

  tr.appendChild(tdKey);
  tr.appendChild(tdValue);
  tr.appendChild(tdRm);
  body.appendChild(tr);
}

function fillCustomHeadersTable(input) {
  const body = document.getElementById("customHeadersBody");
  if (!body) return;
  body.textContent = "";
  const rows = normalizeCustomHeaders(input);
  if (!rows.length) addCustomHeaderRow("", "");
  else for (const r of rows) addCustomHeaderRow(r.key, r.value);
}

function cfgFromInputs() {
  return {
    apiKey: document.getElementById("apiKey").value.trim(),
    baseUrl: document.getElementById("baseUrl").value.trim(),
    model: document.getElementById("model").value.trim(),
    embeddingModel: document.getElementById("embeddingModel").value.trim(),
    hfEndpoint: document.getElementById("hfEndpoint").value.trim(),
    ocrBackend: document.getElementById("ocrBackend")?.value?.trim() || "",
    ocrLanguage: document.getElementById("ocrLanguage")?.value?.trim() || "",
    ocrAutoDownload: Boolean(document.getElementById("ocrAutoDownload")?.checked),
    memoryEnabled: Boolean(document.getElementById("memoryEnabled")?.checked),
    defaultHeaders: customHeadersFromTable(),
    systemContent: document.getElementById("systemContent").value.trim(),
  };
}

function fillInputs(cfg) {
  document.getElementById("apiKey").value = cfg.apiKey || "";
  document.getElementById("baseUrl").value = cfg.baseUrl || "";
  document.getElementById("model").value = cfg.model || "";
  document.getElementById("embeddingModel").value = cfg.embeddingModel || "";
  document.getElementById("hfEndpoint").value = cfg.hfEndpoint || "";
  if (document.getElementById("ocrBackend")) document.getElementById("ocrBackend").value = cfg.ocrBackend || "";
  if (document.getElementById("ocrLanguage")) document.getElementById("ocrLanguage").value = cfg.ocrLanguage || "";
  if (document.getElementById("ocrAutoDownload")) document.getElementById("ocrAutoDownload").checked = Boolean(cfg.ocrAutoDownload);
  if (document.getElementById("memoryEnabled")) document.getElementById("memoryEnabled").checked = cfg.memoryEnabled !== false;
  fillCustomHeadersTable(cfg.defaultHeaders);
  document.getElementById("systemContent").value = cfg.systemContent || "";
}

function setStatus(el, ok, text) {
  el.className = ok ? "hint ok" : "hint err";
  el.textContent = text;
}

function customHeadersToObject(input) {
  const rows = normalizeCustomHeaders(input);
  const out = {};
  for (const r of rows) {
    const key = String(r.key || "").trim();
    const value = String(r.value ?? "").trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function headersFromCfg(cfg) {
  const h = { ...customHeadersToObject(cfg.defaultHeaders) };
  if (cfg.apiKey) h["X-OpenAI-API-Key"] = cfg.apiKey;
  if (cfg.baseUrl) h["X-OpenAI-Base-URL"] = cfg.baseUrl;
  if (cfg.model) h["X-OpenAI-Model"] = cfg.model;
  if (cfg.embeddingModel) h["X-OpenAI-Embedding-Model"] = cfg.embeddingModel;
  if (cfg.hfEndpoint) h["X-HF-Endpoint"] = cfg.hfEndpoint;
  return h;
}

function resolveApiUrl(url) {
  const s = String(url || "");
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith("/")) return s;
  if (window.location.protocol !== "file:") return s;
  const qs = new URLSearchParams(window.location.search);
  const apiBase = String(qs.get("api") || "http://127.0.0.1:8080").trim().replace(/\/+$/, "");
  return apiBase + s;
}

async function apiJson(method, url, body, cfg) {
  const headers = {
    "content-type": "application/json",
    ...headersFromCfg(cfg || loadCfg()),
  };
  const fullUrl = resolveApiUrl(url);
  let resp;
  try {
    resp = await fetch(fullUrl, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    const msg = e?.message ? String(e.message) : String(e || "Failed to fetch");
    throw new Error(`网络错误：${msg}（${method} ${fullUrl}）`);
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const err = new Error(data?.error || `HTTP ${resp.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

async function apiForm(method, url, form, cfg) {
  const headers = {
    ...headersFromCfg(cfg || loadCfg()),
  };
  const fullUrl = resolveApiUrl(url);
  let resp;
  try {
    resp = await fetch(fullUrl, { method, headers, body: form });
  } catch (e) {
    const msg = e?.message ? String(e.message) : String(e || "Failed to fetch");
    throw new Error(`网络错误：${msg}（${method} ${fullUrl}）`);
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const err = new Error(data?.error || `HTTP ${resp.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

async function apiRunStream(args) {
  const cfg = args.cfg || loadCfg();
  const headers = {
    ...headersFromCfg(cfg),
    Accept: "text/event-stream",
  };
  if (args.json) headers["content-type"] = "application/json";
  const fullUrl = resolveApiUrl(args.url || "/run");
  let resp;
  const startedAt = Date.now();
  if (args.onStage) args.onStage({ stage: "client_request", message: "发起请求", data: { url: fullUrl, method: args.method || "POST" } });
  try {
    resp = await fetch(fullUrl, { method: args.method || "POST", headers, body: args.json ? JSON.stringify(args.body || {}) : args.body });
  } catch (e) {
    const msg = e?.message ? String(e.message) : String(e || "Failed to fetch");
    throw new Error(`网络错误：${msg}（${args.method || "POST"} ${fullUrl}）`);
  }

  const ct = String(resp.headers.get("content-type") || "").toLowerCase();
  if (args.onStage) {
    args.onStage({
      stage: "client_response",
      message: "收到响应头",
      data: { status: resp.status, content_type: ct || null, elapsed_ms: Date.now() - startedAt },
    });
  }
  if (!ct.includes("text/event-stream")) {
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      const err = new Error(data?.error || `HTTP ${resp.status}`);
      err.data = data;
      throw err;
    }
    return data;
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  if (args.onStage) args.onStage({ stage: "client_stream_open", message: "SSE 连接已建立" });
  const feed = (chunk) => {
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
        let payload = null;
        try {
          payload = JSON.parse(data);
        } catch {
          payload = { stage: "unknown", message: data };
        }
        if (args.onStage) args.onStage(payload);
      } else if (ev === "result") {
        try {
          result = JSON.parse(data);
        } catch {
          result = { raw: data };
        }
      } else if (ev === "error") {
        let payload = null;
        try {
          payload = JSON.parse(data);
        } catch {
          payload = { error: data };
        }
        throw new Error(payload?.error || "服务端错误");
      } else {
        if (args.onStage) args.onStage({ stage: "client_sse_event", message: `收到事件：${ev}`, data: data ? { data } : null });
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
  if (buf) feed(decoder.decode());
  if (args.onStage) args.onStage({ stage: "client_stream_done", message: "SSE 连接结束" });
  if (!result) throw new Error("未收到结果");
  return result;
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function reloadSkills() {
  const body = document.getElementById("skillsBody");
  if (!body) return;
  body.textContent = "";
  const trLoading = document.createElement("tr");
  const tdLoading = document.createElement("td");
  tdLoading.colSpan = 3;
  tdLoading.textContent = "Loading...";
  trLoading.appendChild(tdLoading);
  body.appendChild(trLoading);
  try {
    const data = await apiJson("GET", "/skills");
    const list = Array.isArray(data?.skills) ? data.skills : [];
    body.textContent = "";
    if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "(empty)";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    for (const s of list) {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      const tdDesc = document.createElement("td");
      const tdGroup = document.createElement("td");
      tdName.textContent = String(s?.name ?? "");
      tdDesc.textContent = String(s?.description ?? "");
      tdGroup.textContent = String(s?.priority_group ?? "");
      tr.appendChild(tdName);
      tr.appendChild(tdDesc);
      tr.appendChild(tdGroup);
      body.appendChild(tr);
    }
  } catch (e) {
    body.textContent = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    const msg = e?.message ? String(e.message) : String(e || "error");
    td.textContent = `加载失败：${msg}`;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function doChoose() {
  const out = document.getElementById("chooseOut");
  out.textContent = "Loading...";
  try {
    const query = document.getElementById("chooseQuery").value;
    const cfg = loadCfg();
    const data = await apiJson("POST", "/choose", { query, ...(cfg.systemContent ? { systemContent: String(cfg.systemContent || "") } : {}) }, cfg);
    out.textContent = pretty(data);
  } catch (e) {
    out.textContent = pretty({ error: e.message, detail: e.data || null });
  }
}

let chatMessages = [];
let chatPreviewOn = false;
let chatCtxMessages = [];
let chatSummary = "";

function renderChat() {
  const wrap = document.getElementById("chatMessages");
  wrap.textContent = "";
  for (const m of chatMessages) {
    const row = document.createElement("div");
    row.className = `msg ${m.role}`;
    const col = document.createElement("div");
    col.className = "msgCol";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = renderMarkdownToHtml(m.text || "");
    highlightIn(bubble);
    col.appendChild(bubble);
    if (m.meta) {
      const meta = document.createElement("div");
      meta.className = "metaLine";
      meta.textContent = m.meta;
      col.appendChild(meta);
    }

    if (m.progressLogs && Array.isArray(m.progressLogs) && m.progressLogs.length) {
      const box = document.createElement("div");
      box.className = "progressBox";
      const head = document.createElement("div");
      head.innerHTML = "<strong>Progress:</strong>";
      box.appendChild(head);
      for (const t of m.progressLogs) {
        const line = document.createElement("div");
        line.textContent = `> ${String(t)}`;
        box.appendChild(line);
      }
      const open = Boolean(m.progressOpen);
      box.style.display = open ? "block" : "none";

      const btn = document.createElement("button");
      btn.className = "progressBtn";
      btn.textContent = open ? "Hide Progress" : "Show Progress";
      btn.onclick = () => {
        m.progressOpen = !Boolean(m.progressOpen);
        box.style.display = m.progressOpen ? "block" : "none";
        btn.textContent = m.progressOpen ? "Hide Progress" : "Show Progress";
      };

      col.appendChild(btn);
      col.appendChild(box);
    }
    
    if (m.trajectory) {
        const traj = document.createElement("div");
        traj.className = "trajectory";
        traj.innerHTML = `<div><strong>Retrieval Trajectory:</strong></div>` + m.trajectory.map(t => `<div>> ${t}</div>`).join("");
        const open = Boolean(m.trajectoryOpen);
        traj.style.display = open ? "block" : "none";
        
        const btn = document.createElement("button");
        btn.className = "trajBtn";
        btn.textContent = open ? "Hide Trajectory" : "Show Trajectory";
        btn.onclick = () => {
            m.trajectoryOpen = !Boolean(m.trajectoryOpen);
            traj.style.display = m.trajectoryOpen ? "block" : "none";
            btn.textContent = m.trajectoryOpen ? "Hide Trajectory" : "Show Trajectory";
        };
        
        col.appendChild(btn);
        col.appendChild(traj);
    }

    row.appendChild(col);
    wrap.appendChild(row);
  }
  wrap.scrollTop = wrap.scrollHeight;
}

function setChatHint(text, ok = true) {
  const el = document.getElementById("chatHint");
  el.className = ok ? "hint ok" : "hint err";
  el.textContent = text || "";
}

function setChatPreview(on) {
  chatPreviewOn = Boolean(on);
  const input = document.getElementById("chatInput");
  const preview = document.getElementById("chatPreview");
  const btn = document.getElementById("chatPreviewBtn");
  if (chatPreviewOn) {
    input.classList.add("vHidden");
    preview.classList.remove("vHidden");
    btn.textContent = "编辑";
    btn.setAttribute("aria-pressed", "true");
    preview.setAttribute("aria-hidden", "false");
    preview.innerHTML = renderMarkdownToHtml(String(input.value || ""));
    highlightIn(preview);
  } else {
    input.classList.remove("vHidden");
    preview.classList.add("vHidden");
    btn.textContent = "预览";
    btn.setAttribute("aria-pressed", "false");
    preview.setAttribute("aria-hidden", "true");
  }
}

function openDrawer() {
  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("drawerBackdrop").classList.remove("hidden");
}

function closeDrawer() {
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("drawerBackdrop").classList.add("hidden");
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const query = String(input.value || "").trim();
  if (!query) return;

  const files = Array.from(document.getElementById("chatDocFile")?.files || []);
  const nextCtxMessages = [...chatCtxMessages, { role: "user", content: query, sessionId: getSessionId() }];

  setChatHint("");
  if (chatPreviewOn) setChatPreview(false);
  chatMessages = [...chatMessages, { role: "user", text: query }];
  chatMessages = [...chatMessages, { role: "assistant", text: "思考中…", meta: "进行中：等待服务端响应" }];
  renderChat();
  input.value = "";

  const assistantIndex = chatMessages.length - 1;
  try {
    let data;
    const progressLogs = [];
    const progressState = {
      lastAt: Date.now(),
      memorySearchAt: 0,
      memoryWarn15: false,
      memoryWarn60: false,
      stallTimer: null,
    };
    const shortJson = (v, max = 220) => {
      if (v == null) return "";
      let s = "";
      try {
        s = JSON.stringify(v);
      } catch {
        s = String(v);
      }
      if (s.length > max) s = s.slice(0, max) + "...";
      return s;
    };
    const clearStallTimer = () => {
      if (progressState.stallTimer) clearInterval(progressState.stallTimer);
      progressState.stallTimer = null;
    };
    const startStallTimer = () => {
      clearStallTimer();
      progressState.stallTimer = setInterval(() => {
        if (!progressState.memorySearchAt) return;
        const now = Date.now();
        const ms = now - progressState.memorySearchAt;
        if (ms >= 15_000 && !progressState.memoryWarn15) {
          progressState.memoryWarn15 = true;
          progressLogs.push(
            `[${new Date().toLocaleTimeString()}] 检索超过 15s 仍未返回（可能在索引/embedding/模型下载）。建议查看服务端控制台日志与网络连通性。`,
          );
          if (progressLogs.length > 80) progressLogs.splice(0, progressLogs.length - 80);
          const meta = `进行中：检索上下文与记忆（已等待 ${Math.floor(ms / 1000)}s）`;
          chatMessages[assistantIndex] = { ...(chatMessages[assistantIndex] || {}), role: "assistant", text: "思考中…", meta, progressLogs };
          renderChat();
        }
        if (ms >= 60_000 && !progressState.memoryWarn60) {
          progressState.memoryWarn60 = true;
          progressLogs.push(
            `[${new Date().toLocaleTimeString()}] 检索超过 60s：如果你用的是 kreuzberg/preset embedding，可能在首次下载模型；可先换 openai embedding 或设置更长超时。`,
          );
          if (progressLogs.length > 80) progressLogs.splice(0, progressLogs.length - 80);
          const meta = `进行中：检索上下文与记忆（已等待 ${Math.floor(ms / 1000)}s）`;
          chatMessages[assistantIndex] = { ...(chatMessages[assistantIndex] || {}), role: "assistant", text: "思考中…", meta, progressLogs };
          renderChat();
        }
      }, 1000);
    };
    const setProgress = (p) => {
      const msg = String(p?.message || "").trim() || "处理中";
      const now = Date.now();
      const deltaMs = now - (progressState.lastAt || now);
      progressState.lastAt = now;
      const stage = String(p?.stage || "").trim();
      const dataText = p && typeof p === "object" && "data" in p && p.data != null ? shortJson(p.data) : "";
      
      // Handle tool progress updates
      if (stage === "tool_progress" && p.data && p.data.toolId && p.data.toolName) {
        toolProgressTracker.onToolProgress({
          toolId: p.data.toolId,
          toolName: p.data.toolName,
          status: p.data.status || 'executing',
          stage: p.data.stage || 'tool_progress',
          message: msg,
          data: p.data
        });
      }
      
      const extraParts = [
        stage ? `stage=${stage}` : "",
        Number.isFinite(deltaMs) && deltaMs > 0 ? `+${deltaMs}ms` : "",
        dataText ? `data=${dataText}` : "",
      ].filter(Boolean);
      progressLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}${extraParts.length ? ` (${extraParts.join(", ")})` : ""}`);
      if (progressLogs.length > 80) progressLogs.splice(0, progressLogs.length - 80);
      if (stage === "memory_search") {
        progressState.memorySearchAt = now;
        progressState.memoryWarn15 = false;
        progressState.memoryWarn60 = false;
        startStallTimer();
      }
      if (stage === "memory_search_done" || stage === "choose_skill" || stage === "chat" || stage === "client_stream_done") {
        progressState.memorySearchAt = 0;
        clearStallTimer();
      }
      const meta =
        progressState.memorySearchAt && stage !== "memory_search_done"
          ? `进行中：${msg}（已等待 ${Math.floor((now - progressState.memorySearchAt) / 1000)}s）`
          : `进行中：${msg}`;
      chatMessages[assistantIndex] = { ...(chatMessages[assistantIndex] || {}), role: "assistant", text: "思考中…", meta, progressLogs };
      renderChat();
    };
    if (files.length) {
      const form = new FormData();
      form.append("query", query);
      for (const f of files) form.append("file", f, f.name);
      form.append("messages", JSON.stringify(nextCtxMessages));
      if (chatSummary) form.append("summary", String(chatSummary || ""));
      const cfg = loadCfg();
      form.append("memory_enabled", cfg.memoryEnabled === false ? "0" : "1");
      if (cfg.ocrBackend) form.append("ocr_backend", String(cfg.ocrBackend || ""));
      if (cfg.ocrLanguage) form.append("ocr_language", String(cfg.ocrLanguage || ""));
      if (cfg.hfEndpoint) form.append("hf_endpoint", String(cfg.hfEndpoint || ""));
      form.append("ocr_auto_download", cfg.ocrAutoDownload ? "1" : "0");
      if (cfg.systemContent) form.append("systemContent", String(cfg.systemContent || ""));
      data = await apiRunStream({ method: "POST", url: "/run", body: form, cfg, onStage: setProgress });
    } else {
      const cfg = loadCfg();
      data = await apiRunStream({
        method: "POST",
        url: "/run",
        json: true,
        body: {
          query,
          messages: nextCtxMessages,
          summary: chatSummary,
          memory: { enabled: cfg.memoryEnabled !== false },
          ...(cfg.ocrBackend ? { ocr_backend: String(cfg.ocrBackend || "") } : {}),
          ...(cfg.ocrLanguage ? { ocr_language: String(cfg.ocrLanguage || "") } : {}),
          ...(typeof cfg.ocrAutoDownload === "boolean" ? { ocr_auto_download: Boolean(cfg.ocrAutoDownload) } : {}),
          ...(cfg.hfEndpoint ? { hf_endpoint: String(cfg.hfEndpoint || "") } : {}),
          ...(cfg.systemContent ? { systemContent: String(cfg.systemContent || "") } : {}),
        },
        cfg,
        onStage: setProgress,
      });
    }
    if (progressState.memorySearchAt) clearStallTimer();
    const response = String(data?.response ?? "");
    const used = Array.isArray(data?.used_skills) ? data.used_skills.join(", ") : "";
    const chosen = data?.chosen?.skill ? String(data.chosen.skill) : "";
    const chatModel = data?.models?.chat ? String(data.models.chat) : "";
    const emb = data?.models?.embedding || null;
    const mem = data?.memory || null;
    const routeText = `route: ${chosen || "none"}`;
    const skillsText = `skills: ${used || "none"}`;
    const modelText = chatModel ? `model: ${chatModel}` : "model: (unknown)";
    const embText =
      emb && emb.provider === "kreuzberg"
        ? `emb: kreuzberg/${String(emb.preset || "")}${emb.dimensions ? ` (${emb.dimensions})` : ""}`
        : emb && emb.provider === "openai_compatible"
          ? `emb: openai/${String(emb.model || "")}`
          : emb && emb.model
            ? `emb: ${String(emb.model)}`
            : "emb: (unknown)";
    const memText =
      mem && mem.retrieval_called
        ? `mem: ${mem.used_in_prompt ? "on" : "off"}${Number.isFinite(mem.retrieved_count) ? ` (${mem.retrieved_count})` : ""}`
        : "mem: (unknown)";
    const hfText = emb && emb.hf_endpoint ? `HF_ENDPOINT: ${String(emb.hf_endpoint)}` : "";
    const metaParts = [routeText, skillsText, modelText, embText, memText, hfText].filter(Boolean);
    const meta = metaParts.join(" · ");
    chatMessages[assistantIndex] = { 
        role: "assistant", 
        text: response || "(empty)", 
        meta,
        trajectory: data?.retrieval_trajectory
    };
    renderChat();
    const returnedSummary = String(data?.summary ?? "").trim();
    if (returnedSummary || data?.summarized) chatSummary = returnedSummary;
    if (Array.isArray(data?.messages) && data.messages.length) {
      chatCtxMessages = data.messages
        .map((m) => ({ role: m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null, content: String(m?.content ?? m?.text ?? ""), sessionId: getSessionId() }))
        .filter((m) => m.role && m.content);
    } else {
      chatCtxMessages = [...nextCtxMessages, { role: "assistant", content: response || "", sessionId: getSessionId() }];
    }
  } catch (e) {
    chatMessages[assistantIndex] = { role: "assistant", text: `请求失败：${e.message || e}` };
    renderChat();
  }
}

async function fetchMemories(path = "/user") {
  const tree = document.getElementById("memoryTree");
  tree.textContent = "Loading...";
  try {
    const sid = getSessionId();
    const data = await apiJson("GET", `/memories?path=${encodeURIComponent(path)}&sessionId=${sid}`);
    tree.textContent = "";
    if (!data.children || !data.children.length) {
      tree.textContent = "(Empty directory)";
      return;
    }
    
    // Sort directories first
    const sorted = data.children.sort((a, b) => {
       if (a.type === "directory" && b.type !== "directory") return -1;
       if (a.type !== "directory" && b.type === "directory") return 1;
       return a.path.localeCompare(b.path);
    });

    for (const node of sorted) {
      const row = document.createElement("div");
      row.className = "memNode";
      
      const info = document.createElement("div");
      info.className = "memPath";
      const icon = node.type === "directory" ? "📁" : "📄";
      info.textContent = `${icon} ${node.path.split("/").pop()}`;
      info.title = node.path;
      if (node.type === "directory") {
        info.style.cursor = "pointer";
        info.onclick = () => fetchMemories(node.path);
      }
      
      const actions = document.createElement("div");
      actions.className = "memActions";
      
      if (node.type !== "directory") {
          const btnDel = document.createElement("button");
          btnDel.className = "memBtn secondary";
          btnDel.textContent = "X";
          btnDel.title = "Delete";
          btnDel.onclick = () => deleteMemory(node.path);
          actions.appendChild(btnDel);
      }
      
      row.appendChild(info);
      row.appendChild(actions);
      tree.appendChild(row);
    }
    
    if (path !== "/user" && path !== "/") {
        const row = document.createElement("div");
        row.className = "memNode";
        row.style.background = "rgba(255,255,255,0.05)";
        const info = document.createElement("div");
        info.className = "memPath";
        info.textContent = "⬅ Back";
        info.style.cursor = "pointer";
        const parts = path.split("/");
        parts.pop();
        const upPath = parts.join("/") || "/user";
        info.onclick = () => fetchMemories(upPath);
        row.appendChild(info);
        tree.prepend(row);
    }

  } catch (e) {
    tree.textContent = `Error: ${e.message}`;
  }
}

async function deleteMemory(path) {
    if (!confirm(`Delete memory: ${path}?`)) return;
    try {
        await apiJson("DELETE", "/memories", { path, sessionId: getSessionId() });
        const parts = path.split("/");
        parts.pop();
        fetchMemories(parts.join("/") || "/");
    } catch (e) {
        alert(e.message);
    }
}

function newChat() {
  chatMessages = [{ role: "assistant", text: "你好，我是 skill-router。把你的任务发给我，必要时可以附带文档。" }];
  chatCtxMessages = [];
  chatSummary = "";
  document.getElementById("chatInput").value = "";
  setChatPreview(false);
  const f = document.getElementById("chatDocFile");
  if (f) f.value = "";
  setChatHint("");
  renderChat();
}

async function doExtract() {
  const out = document.getElementById("docOut");
  out.textContent = "Loading...";
  const files = Array.from(document.getElementById("docFile")?.files || []);
  if (!files.length) {
    out.textContent = pretty({ error: "missing file" });
    return;
  }
  try {
    const form = new FormData();
    for (const f of files) form.append("file", f, f.name);
    const cfg = loadCfg();
    if (cfg.ocrBackend) form.append("ocr_backend", String(cfg.ocrBackend || ""));
    if (cfg.ocrLanguage) form.append("ocr_language", String(cfg.ocrLanguage || ""));
    if (cfg.hfEndpoint) form.append("hf_endpoint", String(cfg.hfEndpoint || ""));
    form.append("ocr_auto_download", cfg.ocrAutoDownload ? "1" : "0");
    const url = resolveApiUrl("/documents/extract");
    let resp;
    try {
      resp = await fetch(url, { method: "POST", body: form });
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e || "Failed to fetch");
      throw new Error(`网络错误：${msg}（POST ${url}）`);
    }
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) throw Object.assign(new Error(data?.error || `HTTP ${resp.status}`), { data });
    const list = Array.isArray(data?.results) ? data.results : [data];
    out.textContent = pretty(
      list.map((it) => ({
        filename: it?.filename,
        mime_type: it?.mime_type,
        result: { ...it?.result, content: String(it?.result?.content || "").slice(0, 2000) },
      })),
    );
  } catch (e) {
    out.textContent = pretty({ error: e.message, detail: e.data || null });
  }
}

let embeddingsPollTimer = null;
let ocrPollTimer = null;

function renderEmbeddingsStatus(data) {
  const hint = document.getElementById("embeddingsHint");
  const list = document.getElementById("embeddingsList");
  if (!hint || !list) return;

  const cacheDir = String(data?.cache_dir || "");
  const hfEndpoint = data?.hf_endpoint ? String(data.hf_endpoint) : "";
  const endpointText = hfEndpoint ? hfEndpoint : "(默认 huggingface.co)";
  hint.textContent = cacheDir ? `Cache: ${cacheDir} · HF_ENDPOINT: ${endpointText}` : `HF_ENDPOINT: ${endpointText}`;
  hint.title = "";

  const presets = Array.isArray(data?.presets) ? data.presets : [];
  list.textContent = "";
  if (!presets.length) {
    list.textContent = "(empty)";
    return;
  }

  for (const p of presets) {
    const preset = String(p?.preset || "");
    const modelName = p?.model_name ? String(p.model_name) : "";
    const dims = Number.isFinite(Number(p?.dimensions)) ? Number(p.dimensions) : null;
    const status = String(p?.status || "not_downloaded");
    const error = p?.error ? String(p.error) : "";
    const logTail = p?.log_tail ? String(p.log_tail) : "";

    const row = document.createElement("div");
    row.className = "memNode";

    const left = document.createElement("div");
    left.className = "memPath";
    left.textContent = `${preset}${modelName ? ` · ${modelName}` : ""}${dims ? ` · ${dims}d` : ""}`;

    const actions = document.createElement("div");
    actions.className = "memActions";

    const pill = document.createElement("span");
    pill.className = "pill";
    if (status === "downloaded") pill.classList.add("ok");
    else if (status === "downloading") pill.classList.add("warn");
    else if (status === "error") pill.classList.add("err");
    else pill.classList.add("muted");
    pill.textContent =
      status === "downloaded"
        ? "已下载"
        : status === "downloading"
          ? "下载中…"
          : status === "error"
            ? "失败"
            : "未下载";
    const tipParts = [];
    if (error) tipParts.push(error);
    if (logTail) tipParts.push(logTail);
    if (tipParts.length) pill.title = tipParts.join("\n\n");
    actions.appendChild(pill);

    const btn = document.createElement("button");
    btn.className = "memBtn secondary";
    btn.textContent = status === "downloaded" ? "重新下载" : "下载";
    btn.disabled = status === "downloading";
    btn.onclick = () => void triggerEmbeddingDownload(preset, status === "downloaded");
    actions.appendChild(btn);

    row.appendChild(left);
    row.appendChild(actions);
    list.appendChild(row);
  }
}

async function refreshEmbeddingsStatus() {
  const hint = document.getElementById("embeddingsHint");
  const list = document.getElementById("embeddingsList");
  if (!hint || !list) return;
  hint.textContent = "Loading...";
  try {
    const cfg = loadCfg();
    const data = await apiJson("GET", "/embeddings/status", null, cfg);
    renderEmbeddingsStatus(data);
    try {
      const w = await apiJson("GET", "/embeddings/warnings?limit=20", null, cfg);
      const arr = Array.isArray(w?.warnings) ? w.warnings : [];
      if (arr.length) {
        const lines = arr
          .map((x) => {
            const ts = x?.ts ? new Date(Number(x.ts)).toLocaleTimeString() : "";
            const provider = x?.provider ? String(x.provider) : "";
            const preset = x?.preset ? String(x.preset) : "";
            const msg = x?.message ? String(x.message) : "";
            return `${ts} ${provider}${preset ? `/${preset}` : ""} ${msg}`.trim();
          })
          .filter(Boolean);
        hint.title = lines.join("\n");
      }
    } catch {
    }
    const presets = Array.isArray(data?.presets) ? data.presets : [];
    const anyDownloading = presets.some((p) => String(p?.status || "") === "downloading");
    if (!anyDownloading && embeddingsPollTimer) {
      clearInterval(embeddingsPollTimer);
      embeddingsPollTimer = null;
    }
  } catch (e) {
    hint.textContent = `加载失败：${e.message || e}`;
    list.textContent = "";
    if (embeddingsPollTimer) {
      clearInterval(embeddingsPollTimer);
      embeddingsPollTimer = null;
    }
  }
}

function renderOcrStatus(data) {
  const hint = document.getElementById("ocrHint");
  const list = document.getElementById("ocrList");
  if (!hint || !list) return;
  const tesseractOk = Boolean(data?.backends?.tesseract?.available);
  const guten = data?.backends?.["guten-ocr"] || null;
  const gutenStatus = String(guten?.status || "not_downloaded");
  const autoDefault = Boolean(data?.auto_download_default);
  hint.textContent = `tesseract: ${tesseractOk ? "可用" : "不可用"} · guten-ocr: ${gutenStatus} · 自动下载默认: ${autoDefault ? "开" : "关"}`;
  hint.title = "";
  list.textContent = "";
  const items = [
    { key: "tesseract", status: tesseractOk ? "available" : "missing", error: "" },
    {
      key: "guten-ocr",
      status: gutenStatus,
      error: guten?.error ? String(guten.error) : "",
      logTail: guten?.log_tail ? String(guten.log_tail) : "",
      registered: Boolean(guten?.registered),
      available: Boolean(guten?.available),
    },
  ];
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "memNode";
    const left = document.createElement("div");
    left.className = "memPath";
    if (it.key === "tesseract") {
      left.textContent = "tesseract (system)";
    } else {
      const extra = [];
      extra.push(it.available ? "available" : "missing");
      extra.push(it.registered ? "registered" : "unregistered");
      left.textContent = `guten-ocr (${extra.join(", ")})`;
    }
    const actions = document.createElement("div");
    actions.className = "memActions";
    const pill = document.createElement("span");
    pill.className = "pill";
    if (it.key === "tesseract") {
      pill.classList.add(it.status === "available" ? "ok" : "err");
      pill.textContent = it.status === "available" ? "可用" : "不可用";
    } else {
      if (it.status === "downloaded") pill.classList.add("ok");
      else if (it.status === "downloading") pill.classList.add("warn");
      else if (it.status === "error") pill.classList.add("err");
      else pill.classList.add("muted");
      pill.textContent =
        it.status === "downloaded"
          ? "已下载"
          : it.status === "downloading"
            ? "下载中…"
            : it.status === "error"
              ? "失败"
              : "未下载";
      const tips = [];
      if (it.error) tips.push(it.error);
      if (it.logTail) tips.push(it.logTail);
      if (tips.length) pill.title = tips.join("\n\n");
    }
    actions.appendChild(pill);
    if (it.key === "guten-ocr") {
      const btn = document.createElement("button");
      btn.className = "memBtn secondary";
      btn.textContent = it.status === "downloaded" ? "重新下载" : "下载";
      btn.disabled = it.status === "downloading";
      btn.onclick = () => void triggerOcrDownload(it.status === "downloaded");
      actions.appendChild(btn);
    }
    row.appendChild(left);
    row.appendChild(actions);
    list.appendChild(row);
  }
}

async function refreshOcrStatus() {
  const hint = document.getElementById("ocrHint");
  const list = document.getElementById("ocrList");
  if (!hint || !list) return;
  hint.textContent = "Loading...";
  try {
    const cfg = loadCfg();
    const data = await apiJson("GET", "/ocr/status", null, cfg);
    renderOcrStatus(data);
    const guten = data?.backends?.["guten-ocr"] || null;
    const status = String(guten?.status || "not_downloaded");
    if (status !== "downloading" && ocrPollTimer) {
      clearInterval(ocrPollTimer);
      ocrPollTimer = null;
    }
  } catch (e) {
    hint.textContent = `加载失败：${e.message || e}`;
    list.textContent = "";
    if (ocrPollTimer) {
      clearInterval(ocrPollTimer);
      ocrPollTimer = null;
    }
  }
}

async function triggerOcrDownload(force = false) {
  const hint = document.getElementById("ocrHint");
  if (!hint) return;
  try {
    const cfg = loadCfg();
    const language = String(document.getElementById("ocrLanguage")?.value || cfg.ocrLanguage || "").trim() || "eng";
    const hfEndpoint = String(document.getElementById("hfEndpoint")?.value || cfg.hfEndpoint || "").trim();
    const data = await apiJson(
      "POST",
      "/ocr/download",
      { backend: "guten-ocr", language, ...(force ? { force: true } : {}), ...(hfEndpoint ? { hf_endpoint: hfEndpoint } : {}) },
      cfg,
    );
    const status = String((data?.job?.status || data?.status) ?? "unknown");
    if (status === "downloading") {
      hint.textContent = `已触发下载：guten-ocr (${language})`;
      if (!ocrPollTimer) ocrPollTimer = setInterval(() => void refreshOcrStatus(), 1500);
    } else {
      hint.textContent = `状态：${status}`;
    }
    await refreshOcrStatus();
  } catch (e) {
    hint.textContent = `触发失败：${e.message || e}`;
  }
}

async function triggerEmbeddingDownload(preset, force = false) {
  const hint = document.getElementById("embeddingsHint");
  if (!hint) return;
  try {
    const cfg = loadCfg();
    const fromArg = String(preset || "").trim();
    const fromSelect = String(document.getElementById("embeddingModel")?.value || "").trim();
    const finalPreset = (fromArg || fromSelect).trim().toLowerCase();
    const data = await apiJson(
      "POST",
      "/embeddings/download",
      { preset: finalPreset, ...(force ? { force: true } : {}), ...(cfg.hfEndpoint ? { hf_endpoint: cfg.hfEndpoint } : {}) },
      cfg,
    );
    if (data?.job?.status === "downloading" || data?.status === "downloading") {
      hint.textContent = `已触发下载：${finalPreset || "(empty)"}`;
      if (!embeddingsPollTimer) {
        embeddingsPollTimer = setInterval(() => void refreshEmbeddingsStatus(), 1500);
      }
    } else {
      hint.textContent = `状态：${String((data?.job?.status || data?.status) ?? "unknown")}`;
    }
    await refreshEmbeddingsStatus();
  } catch (e) {
    hint.textContent = `触发失败：${e.message || e}`;
  }
}

async function checkConnectivity() {
  const status = document.getElementById("cfgStatus");
  const cfg = loadCfg();
  if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
    setStatus(status, false, "请先保存 3 个字段再自检");
    return;
  }
  setStatus(status, true, "自检中…");
  try {
    await apiJson("POST", "/choose", { query: "ping", ...(cfg.systemContent ? { systemContent: String(cfg.systemContent || "") } : {}) }, cfg);
    setStatus(status, true, "OK：后端可使用本地保存配置调用模型");
  } catch (e) {
    setStatus(status, false, `失败：${e.message}`);
  }
}

const cfgStatus = document.getElementById("cfgStatus");
fillInputs(loadCfg());
setStatus(cfgStatus, true, "提示：配置保存在浏览器本地（localStorage），关闭/重新打开仍保留");

const memoryEnabledEl = document.getElementById("memoryEnabled");
if (memoryEnabledEl) {
  memoryEnabledEl.addEventListener("change", () => {
    const cfg = loadCfg();
    cfg.memoryEnabled = Boolean(memoryEnabledEl.checked);
    saveCfg(cfg);
  });
}

document.getElementById("saveCfg").addEventListener("click", () => {
  const cfg = cfgFromInputs();
  saveCfg(cfg);
  setStatus(cfgStatus, true, "已保存到浏览器本地");
});

document.getElementById("clearCfg").addEventListener("click", () => {
  clearCfg();
  fillInputs({});
  setStatus(cfgStatus, true, "已清空本地保存配置");
});

document.getElementById("addCustomHeader").addEventListener("click", () => addCustomHeaderRow("", ""));
document.getElementById("checkCfg").addEventListener("click", checkConnectivity);
document.getElementById("reloadSkills").addEventListener("click", reloadSkills);
document.getElementById("btnChoose").addEventListener("click", doChoose);
  document.getElementById("btnExtract").addEventListener("click", doExtract);
  document.getElementById("refreshMemories").addEventListener("click", () => fetchMemories());
  document.getElementById("refreshEmbeddings").addEventListener("click", () => void refreshEmbeddingsStatus());
  if (document.getElementById("refreshOcr")) document.getElementById("refreshOcr").addEventListener("click", () => void refreshOcrStatus());
  if (document.getElementById("downloadOcr")) document.getElementById("downloadOcr").addEventListener("click", () => void triggerOcrDownload(false));

  document.getElementById("menuBtn").addEventListener("click", openDrawer);
document.getElementById("drawerClose").addEventListener("click", closeDrawer);
document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
document.getElementById("newChatBtn").addEventListener("click", newChat);
document.getElementById("chatSend").addEventListener("click", sendChat);
document.getElementById("chatPreviewBtn").addEventListener("click", () => setChatPreview(!chatPreviewOn));
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendChat();
  }
});

document.addEventListener("keydown", (e) => {
  if (chatPreviewOn && e.key === "Escape") {
    e.preventDefault();
    setChatPreview(false);
    document.getElementById("chatInput").focus();
  }
});

newChat();
  reloadSkills();
  fetchMemories();
  refreshEmbeddingsStatus();
  refreshOcrStatus();
