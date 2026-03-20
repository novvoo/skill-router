import net from "node:net";

export type ExternalApiContextOptions = {
  enabled: boolean;
  maxUrls: number;
  timeoutMs: number;
  maxBytes: number;
  maxChars: number;
  allowHttp: boolean;
  allowPrivateHosts: boolean;
  allowlistHosts: string[];
};

export type ExternalApiFetchItem = {
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  body: string | null;
  truncated: boolean;
  error: string | null;
};

function normalizeAllowlistHost(host: string): string | null {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return null;
  if (h.includes("/") || h.includes("\\") || h.includes("\0")) return null;
  return h;
}

function parseAllowlistHosts(raw: string): string[] {
  const items = String(raw || "")
    .split(/[,\s]+/g)
    .map((s) => normalizeAllowlistHost(s))
    .filter(Boolean) as string[];
  return Array.from(new Set(items));
}

function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (!v) return false;
  if (v === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  return false;
}

function isLikelyPrivateHost(hostname: string): boolean {
  const h = String(hostname || "").trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (isPrivateIp(h)) return true;
  return false;
}

function isAllowedByAllowlist(hostname: string, allowlistHosts: string[]): boolean {
  if (!allowlistHosts.length) return true;
  const h = String(hostname || "").trim().toLowerCase();
  if (!h) return false;
  for (const allowed of allowlistHosts) {
    if (h === allowed) return true;
    if (allowed.startsWith(".") && h.endsWith(allowed)) return true;
    if (!allowed.startsWith(".") && h.endsWith("." + allowed)) return true;
  }
  return false;
}

export function getExternalApiContextOptionsFromEnv(): ExternalApiContextOptions {
  const enabledRaw = String(process.env.API_CONTEXT_ENABLED || "").trim();
  const enabled = enabledRaw ? enabledRaw === "1" || enabledRaw.toLowerCase() === "true" : true;
  const maxUrls = Math.max(0, Number(String(process.env.API_CONTEXT_MAX_URLS || "").trim() || "3") || 3);
  const timeoutMs = Math.max(0, Number(String(process.env.API_CONTEXT_TIMEOUT_MS || "").trim() || "5000") || 5000);
  const maxBytes = Math.max(1024, Number(String(process.env.API_CONTEXT_MAX_BYTES || "").trim() || "200000") || 200000);
  const maxChars = Math.max(500, Number(String(process.env.API_CONTEXT_MAX_CHARS || "").trim() || "6000") || 6000);
  const allowHttp = String(process.env.API_CONTEXT_ALLOW_HTTP || "").trim() === "1";
  const allowPrivateHosts = String(process.env.API_CONTEXT_ALLOW_PRIVATE || "").trim() === "1";
  const allowlistHosts = parseAllowlistHosts(String(process.env.API_CONTEXT_ALLOWLIST_HOSTS || "").trim());
  return { enabled, maxUrls, timeoutMs, maxBytes, maxChars, allowHttp, allowPrivateHosts, allowlistHosts };
}

function stripTrailingPunctuation(url: string): string {
  return String(url || "").replace(/[)\]}>,.;!?]+$/g, "");
}

export function extractHttpUrls(text: string, maxUrls: number): string[] {
  const raw = String(text || "");
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const candidate = stripTrailingPunctuation(String(m[0] || ""));
    let u: URL;
    try {
      u = new URL(candidate);
    } catch {
      continue;
    }
    const href = u.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= maxUrls) break;
  }
  return out;
}

async function readBodyWithLimit(resp: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const body = resp.body;
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let used = 0;
  let truncated = false;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    const chunk = r.value;
    if (!chunk || !chunk.byteLength) continue;
    const next = used + chunk.byteLength;
    if (next > maxBytes) {
      const take = Math.max(0, maxBytes - used);
      if (take > 0) chunks.push(chunk.slice(0, take));
      truncated = true;
      try {
        await reader.cancel();
      } catch {}
      break;
    }
    chunks.push(chunk);
    used = next;
  }
  const merged = chunks.length ? Buffer.concat(chunks.map((c) => Buffer.from(c))) : Buffer.from([]);
  return { text: merged.toString("utf8"), truncated };
}

function prettyMaybeJson(text: string, contentType: string | null): string {
  const t = String(text || "").trim();
  if (!t) return "";
  const ct = String(contentType || "").toLowerCase();
  const looksJson = ct.includes("application/json") || ct.includes("+json") || t.startsWith("{") || t.startsWith("[");
  if (!looksJson) return t;
  try {
    const parsed = JSON.parse(t);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return t;
  }
}

function clipChars(s: string, maxChars: number): { text: string; clipped: boolean } {
  const str = String(s || "");
  if (str.length <= maxChars) return { text: str, clipped: false };
  return { text: str.slice(0, maxChars), clipped: true };
}

export async function fetchExternalApiContextsFromText(
  text: string,
  opts: ExternalApiContextOptions,
): Promise<{ contextText: string; urls: string[]; items: ExternalApiFetchItem[] }> {
  if (!opts.enabled) return { contextText: "", urls: [], items: [] };
  const urls = extractHttpUrls(text, opts.maxUrls);
  if (!urls.length) return { contextText: "", urls: [], items: [] };

  const items: ExternalApiFetchItem[] = [];
  for (const url of urls) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    const protocol = u.protocol.toLowerCase();
    if (protocol !== "https:" && !(protocol === "http:" && opts.allowHttp)) {
      items.push({
        url,
        ok: false,
        status: null,
        contentType: null,
        body: null,
        truncated: false,
        error: `blocked protocol: ${protocol}`,
      });
      continue;
    }
    if (!opts.allowPrivateHosts && isLikelyPrivateHost(u.hostname)) {
      items.push({
        url,
        ok: false,
        status: null,
        contentType: null,
        body: null,
        truncated: false,
        error: `blocked host: ${u.hostname}`,
      });
      continue;
    }
    if (!isAllowedByAllowlist(u.hostname, opts.allowlistHosts)) {
      items.push({
        url,
        ok: false,
        status: null,
        contentType: null,
        body: null,
        truncated: false,
        error: `blocked by allowlist: ${u.hostname}`,
      });
      continue;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow", signal: ac.signal });
      const contentType = resp.headers.get("content-type");
      const { text: bodyRaw, truncated } = await readBodyWithLimit(resp, opts.maxBytes);
      const bodyPretty = prettyMaybeJson(bodyRaw, contentType);
      const { text: clippedBody, clipped } = clipChars(bodyPretty, opts.maxChars);
      items.push({
        url,
        ok: resp.ok,
        status: resp.status,
        contentType: contentType ? String(contentType) : null,
        body: clippedBody,
        truncated: truncated || clipped,
        error: resp.ok ? null : `HTTP ${resp.status}`,
      });
    } catch (e: any) {
      const detail = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
      items.push({ url, ok: false, status: null, contentType: null, body: null, truncated: false, error: detail });
    } finally {
      clearTimeout(timer);
    }
  }

  const okItems = items.filter((it) => it.ok && it.body);
  if (!okItems.length) return { contextText: "", urls, items };

  const lines: string[] = ["[外部API数据]"];
  for (const it of okItems) {
    lines.push(`- URL: ${it.url}`);
    if (it.status != null) lines.push(`  Status: ${it.status}`);
    if (it.contentType) lines.push(`  Content-Type: ${it.contentType}`);
    lines.push("  Body:");
    const bodyLines = String(it.body || "").split(/\r?\n/g);
    for (const bl of bodyLines) lines.push(`  ${bl}`);
    if (it.truncated) lines.push("  (truncated)");
  }
  return { contextText: lines.join("\n"), urls, items };
}

