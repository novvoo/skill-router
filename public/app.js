import { marked } from "/vendor/marked/lib/marked.esm.js";
import DOMPurify from "/vendor/dompurify/dist/purify.es.mjs";
import hljs from "/vendor/highlight.js/es/common.js";

const KEY = "skill-router:openai";
const SESSION_KEY = "skill-router:session_id";

function getSessionId() {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

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
    const local = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
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
    defaultHeaders: customHeadersFromTable(),
    systemContent: document.getElementById("systemContent").value.trim(),
  };
}

function fillInputs(cfg) {
  document.getElementById("apiKey").value = cfg.apiKey || "";
  document.getElementById("baseUrl").value = cfg.baseUrl || "";
  document.getElementById("model").value = cfg.model || "";
  document.getElementById("embeddingModel").value = cfg.embeddingModel || "";
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
    
    if (m.trajectory) {
        const traj = document.createElement("div");
        traj.className = "trajectory";
        traj.innerHTML = `<div><strong>Retrieval Trajectory:</strong></div>` + m.trajectory.map(t => `<div>> ${t}</div>`).join("");
        
        const btn = document.createElement("button");
        btn.className = "trajBtn";
        btn.textContent = "Show Trajectory";
        btn.onclick = () => {
            if (traj.style.display === "block") {
                traj.style.display = "none";
                btn.textContent = "Show Trajectory";
            } else {
                traj.style.display = "block";
                btn.textContent = "Hide Trajectory";
            }
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

  const file = document.getElementById("chatDocFile").files?.[0] || null;
  const nextCtxMessages = [...chatCtxMessages, { role: "user", content: query, sessionId: getSessionId() }];

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
      form.append("messages", JSON.stringify(nextCtxMessages));
      if (chatSummary) form.append("summary", String(chatSummary || ""));
      const cfg = loadCfg();
      if (cfg.systemContent) form.append("systemContent", String(cfg.systemContent || ""));
      data = await apiForm("POST", "/run", form);
    } else {
      const cfg = loadCfg();
      data = await apiJson(
        "POST",
        "/run",
        { query, messages: nextCtxMessages, summary: chatSummary, ...(cfg.systemContent ? { systemContent: String(cfg.systemContent || "") } : {}) },
        cfg,
      );
    }
    const response = String(data?.response ?? "");
    const used = Array.isArray(data?.used_skills) ? data.used_skills.join(", ") : "";
    const chosen = data?.chosen?.skill ? String(data.chosen.skill) : "";
    const meta = chosen ? `chosen: ${chosen}${used ? ` · used: ${used}` : ""}` : used ? `used: ${used}` : "";
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
    await apiJson("POST", "/choose", { query: "ping", ...(cfg.systemContent ? { systemContent: String(cfg.systemContent || "") } : {}) }, cfg);
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

document.getElementById("addCustomHeader").addEventListener("click", () => addCustomHeaderRow("", ""));
document.getElementById("checkCfg").addEventListener("click", checkConnectivity);
document.getElementById("reloadSkills").addEventListener("click", reloadSkills);
document.getElementById("btnChoose").addEventListener("click", doChoose);
  document.getElementById("btnExtract").addEventListener("click", doExtract);
  document.getElementById("refreshMemories").addEventListener("click", () => fetchMemories());

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
