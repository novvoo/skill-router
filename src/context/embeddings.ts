import { extractBytes } from "@kreuzberg/node";
import { OpenAIConfig } from "../handler.js";
import path from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

const VALID_PRESETS = new Set(["fast", "balanced", "quality", "multilingual", "compact", "large", "accurate"]);
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

let lastEmbeddingDim = 384;
let hfCacheRepaired = false;
const kreuzbergInitByKey = new Map<string, Promise<void>>();

function normalizeHfEndpoint(raw: unknown): string | null {
  const v0 = String(raw || "").trim();
  if (!v0) return null;
  const v = v0.replace(/^['"`\s]+|['"`\s]+$/g, "").replace(/\/+$/g, "");
  if (!v) return null;
  if (v === "https://huggingface.co") return v;
  if (v === "https://hf-mirror.com") return v;
  return null;
}

function resolveKreuzbergCacheDir(): string {
  const cacheDirFromEnv = String(process.env.KREUZBERG_CACHE_DIR || "").trim();
  if (cacheDirFromEnv) return path.resolve(process.cwd(), cacheDirFromEnv);
  const preferred = path.resolve(process.cwd(), ".cache/models");
  const legacy = path.resolve(process.cwd(), ".cache");
  try {
    if (existsSync(preferred)) return preferred;
    if (existsSync(legacy)) {
      const hasModels = readdirSync(legacy, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.startsWith("models--"));
      if (hasModels) return legacy;
    }
  } catch {
  }
  return preferred;
}

function getDimension(preset: string): number {
  switch (preset) {
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
      return 384;
  }
}

function parseKreuzbergPreset(model: string): string | null {
  const m = String(model || "").trim().toLowerCase();
  if (!m) return null;
  if (m === "preset" || m === "kreuzberg") return "fast";
  if (m.startsWith("preset:") || m.startsWith("preset/")) {
    const v = m.slice(7).trim();
    return VALID_PRESETS.has(v) ? v : null;
  }
  if (m.startsWith("kreuzberg:") || m.startsWith("kreuzberg/")) {
    const v = m.slice(10).trim();
    return VALID_PRESETS.has(v) ? v : null;
  }
  return VALID_PRESETS.has(m) ? m : null;
}

function repairHfHubCache(cacheDir: string) {
  if (!existsSync(cacheDir)) return;

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

    if (!existsSync(refPath)) continue;
    const commitHash = String(readFileSync(refPath, "utf-8")).trim();
    if (!commitHash) continue;

    const snapshotDir = path.join(repoDir, "snapshots", commitHash);
    if (existsSync(snapshotDir)) {
      const maybeCopy = (rel: string) => {
        const src = path.join(repoDir, rel);
        const dst = path.join(snapshotDir, rel);
        if (!existsSync(src)) return;
        if (existsSync(dst)) return;
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
          if (!ent.isFile()) continue;
          const src = path.join(onnxDir, ent.name);
          const dst = path.join(snapshotOnnxDir, ent.name);
          if (!existsSync(dst)) copyFileSync(src, dst);
        }
      }
    }

    const pointerPath = path.join(repoDir, "snapshots", commitHash, "onnx", "model.onnx");
    if (existsSync(pointerPath)) continue;

    const blobsDir = path.join(repoDir, "blobs");
    if (!existsSync(blobsDir)) continue;

    const blobCandidates = readdirSync(blobsDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => path.join(blobsDir, d.name))
      .filter((p) => {
        const ext = path.extname(p).toLowerCase();
        return ext !== ".lock" && ext !== ".part";
      });

    if (blobCandidates.length === 0) continue;

    let bestBlob = blobCandidates[0];
    let bestSize = -1;
    for (const p of blobCandidates) {
      try {
        const size = statSync(p).size;
        if (size > bestSize) {
          bestSize = size;
          bestBlob = p;
        }
      } catch {
        continue;
      }
    }

    mkdirSync(path.dirname(pointerPath), { recursive: true });
    copyFileSync(bestBlob, pointerPath);
  }
}

function zeroVector(dim: number): number[] {
  const safeDim = Number.isFinite(dim) && dim > 0 ? Math.floor(dim) : lastEmbeddingDim;
  return new Array(safeDim).fill(0);
}

type ProcessingWarning = { source?: string; message?: string };

function getProcessingWarnings(result: any): ProcessingWarning[] {
  const arr = Array.isArray(result?.processingWarnings) ? result.processingWarnings : [];
  return arr
    .map((w: any) => ({ source: w?.source, message: w?.message }))
    .filter((w: ProcessingWarning) => Boolean(String(w?.message || "").trim()));
}

function hasContentRangeMissingWarning(warnings: ProcessingWarning[]): boolean {
  for (const w of warnings) {
    const msg = String(w?.message || "");
    if (msg.includes("Content-Range") && msg.toLowerCase().includes("missing")) return true;
  }
  return false;
}

function extractEmbeddingFromKreuzbergResult(result: any): number[] | null {
  const first = result?.chunks?.[0]?.embedding;
  if (Array.isArray(first) && first.length) return first;
  const root = (result as any)?.embeddings?.[0];
  if (Array.isArray(root) && root.length) return root;
  return null;
}

function cleanupPartialFiles(rootDir: string) {
  if (!rootDir || !existsSync(rootDir)) return;
  const stack: string[] = [rootDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" }) as any;
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (ext !== ".part" && ext !== ".lock") continue;
      try {
        rmSync(full, { force: true });
      } catch {
      }
    }
  }
}

async function kreuzbergEmbedOnce(
  text: string,
  preset: string,
  cacheDir: string,
  hfEndpoint: string | null,
): Promise<{ embedding: number[] | null; warnings: ProcessingWarning[] }> {
  const buffer = Buffer.from(text, "utf-8");
  const uint8Array = new Uint8Array(buffer);
  if (hfEndpoint) process.env.HF_ENDPOINT = hfEndpoint;
  const result = await extractBytes(uint8Array, "text/plain", {
    embeddings: true,
    chunking: {
      maxChars: 100000,
      maxOverlap: 0,
      embedding: {
        model: { modelType: "preset", value: preset },
        cacheDir,
        showDownloadProgress: false,
      },
    },
  } as any);
  const warnings = getProcessingWarnings(result);
  const embedding = extractEmbeddingFromKreuzbergResult(result);
  return { embedding, warnings };
}

async function ensureKreuzbergReady(preset: string, cacheDir: string, hubCache: string, hfEndpoint: string | null) {
  const key = `${preset}|${cacheDir}|${hubCache}|${hfEndpoint || ""}`;
  const existing = kreuzbergInitByKey.get(key);
  if (existing) return existing;

  const init = (async () => {
    const warmupText = "warmup";
    let { embedding, warnings } = await kreuzbergEmbedOnce(warmupText, preset, cacheDir, hfEndpoint);
    if (embedding) return;

    if (hasContentRangeMissingWarning(warnings)) {
      cleanupPartialFiles(cacheDir);
      cleanupPartialFiles(hubCache);
      ({ embedding, warnings } = await kreuzbergEmbedOnce(warmupText, preset, cacheDir, hfEndpoint));
      if (embedding) return;
      return;
    }
  })();

  kreuzbergInitByKey.set(key, init);
  return init;
}

async function createOpenAIEmbeddings(config: OpenAIConfig, model: string, inputs: string[]): Promise<number[][]> {
  const base = config.baseUrl.endsWith("/") ? config.baseUrl : config.baseUrl + "/";
  const url = new URL("embeddings", base).toString();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.defaultHeaders || {}),
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: inputs }),
    });
  } catch (e: any) {
    const cause = e?.cause;
    const detail = cause?.code || cause?.message || e?.message || String(e);
    throw new Error(`OpenAI-compatible fetch failed (${url}): ${detail}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Embeddings request failed: ${resp.status} ${resp.statusText}${text ? ` - ${text}` : ""}`);
  }

  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Embeddings response was not valid JSON");
  }

  const data = Array.isArray(json?.data) ? json.data : null;
  if (!data) throw new Error("Embeddings response missing data[]");

  const sorted = [...data].sort((a, b) => Number(a?.index ?? 0) - Number(b?.index ?? 0));
  const vectors: number[][] = [];
  for (const item of sorted) {
    const emb = item?.embedding;
    if (!Array.isArray(emb)) throw new Error("Embeddings response data item missing embedding[]");
    vectors.push(emb);
  }

  if (vectors[0]?.length) lastEmbeddingDim = vectors[0].length;
  return vectors;
}

export async function createEmbeddings(config: OpenAIConfig, input: string | string[]): Promise<number[][]> {
  const inputs = Array.isArray(input) ? input : [input];

  const rawModel = String(config.embeddingModel || "").trim();
  const parsedPreset = parseKreuzbergPreset(rawModel);
  const useKreuzberg = Boolean(parsedPreset);
  const preset = parsedPreset || "fast";
  if (useKreuzberg) {
    lastEmbeddingDim = getDimension(preset);
  }
  const hfEndpoint = normalizeHfEndpoint((config as any).hfEndpoint);
  if (hfEndpoint) process.env.HF_ENDPOINT = hfEndpoint;

  const cacheDir = resolveKreuzbergCacheDir();
  const base = cacheDir.toLowerCase().endsWith(`${path.sep}models`) ? path.dirname(cacheDir) : cacheDir;
  const root = path.resolve(base);
  process.env.XDG_CACHE_HOME = path.join(root, "xdg-cache");
  process.env.HF_HOME = path.join(root, "hf-home");
  const hubCache = path.join(root, "huggingface", "hub");
  process.env.HF_HUB_CACHE = hubCache;
  process.env.HUGGINGFACE_HUB_CACHE = hubCache;
  if (!existsSync(cacheDir)) {
    try {
        mkdirSync(cacheDir, { recursive: true });
    } catch (e) {
        // Ignore if exists or permission denied (will fail later if needed)
    }
  }

  if (useKreuzberg && !hfCacheRepaired) {
    hfCacheRepaired = true;
    try {
      repairHfHubCache(cacheDir);
    } catch {
    }
    try {
      repairHfHubCache(hubCache);
    } catch {
    }
  }

  if (!useKreuzberg) {
    const nonEmpty: Array<{ index: number; text: string }> = [];
    const empty = new Set<number>();
    const out: number[][] = inputs.map(() => []);
    for (let i = 0; i < inputs.length; i++) {
      const text = String(inputs[i] || "");
      if (!text.trim()) {
        empty.add(i);
        continue;
      }
      nonEmpty.push({ index: i, text });
    }
    try {
      if (!nonEmpty.length) return inputs.map(() => zeroVector(lastEmbeddingDim));
      const vecs = await createOpenAIEmbeddings(
        config,
        rawModel || DEFAULT_OPENAI_EMBEDDING_MODEL,
        nonEmpty.map((x) => x.text),
      );
      for (let i = 0; i < nonEmpty.length; i++) out[nonEmpty[i].index] = vecs[i];
      for (const idx of empty) out[idx] = zeroVector(lastEmbeddingDim);
      return out.map((v) => (v.length ? v : zeroVector(lastEmbeddingDim)));
    } catch (e: any) {
      console.error("OpenAI-compatible embedding failed:", e);
      return inputs.map(() => zeroVector(lastEmbeddingDim));
    }
  }

  try {
    await ensureKreuzbergReady(preset, cacheDir, hubCache, hfEndpoint);
  } catch {
  }

  const results: number[][] = [];
  for (const text of inputs) {
    const dim = getDimension(preset);
    if (!String(text || "").trim()) {
      results.push(zeroVector(dim));
      continue;
    }

    try {
      let { embedding, warnings } = await kreuzbergEmbedOnce(text, preset, cacheDir, hfEndpoint);
      if (embedding) {
        results.push(embedding);
        continue;
      }

      if (hasContentRangeMissingWarning(warnings)) {
        cleanupPartialFiles(cacheDir);
        cleanupPartialFiles(hubCache);
        ({ embedding, warnings } = await kreuzbergEmbedOnce(text, preset, cacheDir, hfEndpoint));
        if (embedding) {
          results.push(embedding);
          continue;
        }
      }

      console.warn(`Kreuzberg returned no embedding for input. Preset: ${preset}, Text length: ${text.length}`);
      if (warnings.length) console.warn("Processing warnings:", warnings);
      results.push(zeroVector(dim));
    } catch (e: any) {
      console.error("Kreuzberg embedding failed:", e);
      results.push(zeroVector(dim));
    }
  }

  return results;
}
