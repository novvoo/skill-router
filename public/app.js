import { marked } from "/vendor/marked/lib/marked.esm.js";
import DOMPurify from "/vendor/dompurify/dist/purify.es.mjs";
import hljs from "/vendor/highlight.js/es/common.js";

const KEY = "skill-router:openai";

function safeLinkHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return u.toString();
  } catch {}
  return "";
}

const mdRenderer = new marked.Renderer();
mdRenderer.link = (href, title, text) => {
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
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
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

function cfgFromInputs() {
  return {
    apiKey: document.getElementById("apiKey").value.trim(),
    baseUrl: document.getElementById("baseUrl").value.trim(),
    model: document.getElementById("model").value.trim(),
  };
}

function fillInputs(cfg) {
  document.getElementById("apiKey").value = cfg.apiKey || "";
  document.getElementById("baseUrl").value = cfg.baseUrl || "";
  document.getElementById("model").value = cfg.model || "";
}

function setStatus(el, ok, text) {
  el.className = ok ? "hint ok" : "hint err";
  el.textContent = text;
}

function headersFromCfg(cfg) {
  const h = {};
  if (cfg.apiKey) h["X-OpenAI-API-Key"] = cfg.apiKey;
  if (cfg.baseUrl) h["X-OpenAI-Base-URL"] = cfg.baseUrl;
  if (cfg.model) h["X-OpenAI-Model"] = cfg.model;
  return h;
}

async function apiJson(method, url, body, cfg) {
  const headers = {
    "content-type": "application/json",
    ...headersFromCfg(cfg || loadCfg()),
  };
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
  const resp = await fetch(url, { method, headers, body: form });
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

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function reloadSkills() {
  const out = document.getElementById("skillsOut");
  out.textContent = "Loading...";
  try {
    const data = await apiJson("GET", "/skills");
    out.textContent = pretty(data);
  } catch (e) {
    out.textContent = pretty({ error: e.message, detail: e.data || null });
  }
}

async function doChoose() {
  const out = document.getElementById("chooseOut");
  out.textContent = "Loading...";
  try {
    const query = document.getElementById("chooseQuery").value;
    const data = await apiJson("POST", "/choose", { query });
    out.textContent = pretty(data);
  } catch (e) {
    out.textContent = pretty({ error: e.message, detail: e.data || null });
  }
}

let chatMessages = [];
let chatPreviewOn = false;

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

  const file = document.getElementById("chatDocFile").files?.[0] || null;

  setChatHint("");
  if (chatPreviewOn) setChatPreview(false);
  chatMessages = [...chatMessages, { role: "user", text: query }];
  chatMessages = [...chatMessages, { role: "assistant", text: "思考中…" }];
  renderChat();
  input.value = "";

  const assistantIndex = chatMessages.length - 1;
  try {
    let data;
    if (file) {
      const form = new FormData();
      form.append("query", query);
      form.append("file", file, file.name);
      data = await apiForm("POST", "/run", form);
    } else {
      data = await apiJson("POST", "/run", { query });
    }
    const response = String(data?.response ?? "");
    const used = Array.isArray(data?.used_skills) ? data.used_skills.join(", ") : "";
    const chosen = data?.chosen?.skill ? String(data.chosen.skill) : "";
    const meta = chosen ? `chosen: ${chosen}${used ? ` · used: ${used}` : ""}` : used ? `used: ${used}` : "";
    chatMessages[assistantIndex] = { role: "assistant", text: response || "(empty)", meta };
    renderChat();
  } catch (e) {
    chatMessages[assistantIndex] = { role: "assistant", text: `请求失败：${e.message || e}` };
    renderChat();
  }
}

function newChat() {
  chatMessages = [{ role: "assistant", text: "你好，我是 skill-router。把你的任务发给我，必要时可以附带文档。" }];
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
  const file = document.getElementById("docFile").files?.[0] || null;
  if (!file) {
    out.textContent = pretty({ error: "missing file" });
    return;
  }
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const resp = await fetch("/documents/extract", { method: "POST", body: form });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) throw Object.assign(new Error(data?.error || `HTTP ${resp.status}`), { data });
    out.textContent = pretty({ filename: data.filename, result: { ...data.result, content: String(data?.result?.content || "").slice(0, 2000) } });
  } catch (e) {
    out.textContent = pretty({ error: e.message, detail: e.data || null });
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
    await apiJson("POST", "/choose", { query: "ping" }, cfg);
    setStatus(status, true, "OK：后端可使用本地保存配置调用模型");
  } catch (e) {
    setStatus(status, false, `失败：${e.message}`);
  }
}

const cfgStatus = document.getElementById("cfgStatus");
fillInputs(loadCfg());
setStatus(cfgStatus, true, "提示：配置保存在浏览器本地（localStorage），关闭/重新打开仍保留");

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

document.getElementById("checkCfg").addEventListener("click", checkConnectivity);
document.getElementById("reloadSkills").addEventListener("click", reloadSkills);
document.getElementById("btnChoose").addEventListener("click", doChoose);
document.getElementById("btnExtract").addEventListener("click", doExtract);

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
