import { extractBytes, getEmbeddingPreset } from "@kreuzberg/node";
import path from "path";
import fsSync from "node:fs";
import { getOnnxRuntimePath } from "../src/utils.js";

function repairHfHubCache(cacheDir: string) {
  if (!fsSync.existsSync(cacheDir)) return;

  const repoDirs = fsSync
    .readdirSync(cacheDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("models--"))
    .map((d) => path.join(cacheDir, d.name));

  for (const repoDir of repoDirs) {
    const refPath = path.join(repoDir, "refs", "main");
    if (!fsSync.existsSync(refPath)) {
      const hasFlatLayout =
        fsSync.existsSync(path.join(repoDir, "config.json")) &&
        fsSync.existsSync(path.join(repoDir, "tokenizer.json"));

      if (hasFlatLayout) {
        const commitHash = "0000000000000000000000000000000000000000";
        fsSync.mkdirSync(path.dirname(refPath), { recursive: true });
        fsSync.writeFileSync(refPath, commitHash + "\n");

        const snapshotDir = path.join(repoDir, "snapshots", commitHash);
        fsSync.mkdirSync(snapshotDir, { recursive: true });

        const maybeCopy = (rel: string) => {
          const src = path.join(repoDir, rel);
          const dst = path.join(snapshotDir, rel);
          if (!fsSync.existsSync(src)) return;
          if (fsSync.existsSync(dst)) return;
          fsSync.mkdirSync(path.dirname(dst), { recursive: true });
          fsSync.copyFileSync(src, dst);
        };

        for (const rel of [
          "config.json",
          "tokenizer.json",
          "tokenizer_config.json",
          "special_tokens_map.json",
          "vocab.txt",
        ]) {
          maybeCopy(rel);
        }

        const onnxDir = path.join(repoDir, "onnx");
        if (fsSync.existsSync(onnxDir)) {
          const snapshotOnnxDir = path.join(snapshotDir, "onnx");
          fsSync.mkdirSync(snapshotOnnxDir, { recursive: true });
          for (const ent of fsSync.readdirSync(onnxDir, { withFileTypes: true })) {
            if (!ent.isFile()) continue;
            const src = path.join(onnxDir, ent.name);
            const dst = path.join(snapshotOnnxDir, ent.name);
            if (!fsSync.existsSync(dst)) fsSync.copyFileSync(src, dst);
          }
        }
      }
    }

    if (!fsSync.existsSync(refPath)) continue;

    const commitHash = String(fsSync.readFileSync(refPath, "utf-8")).trim();
    if (!commitHash) continue;

    const snapshotDir = path.join(repoDir, "snapshots", commitHash);
    if (fsSync.existsSync(snapshotDir)) {
      const maybeCopy = (rel: string) => {
        const src = path.join(repoDir, rel);
        const dst = path.join(snapshotDir, rel);
        if (!fsSync.existsSync(src)) return;
        if (fsSync.existsSync(dst)) return;
        fsSync.mkdirSync(path.dirname(dst), { recursive: true });
        fsSync.copyFileSync(src, dst);
      };

      for (const rel of [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "vocab.txt",
      ]) {
        maybeCopy(rel);
      }

      const onnxDir = path.join(repoDir, "onnx");
      if (fsSync.existsSync(onnxDir)) {
        const snapshotOnnxDir = path.join(snapshotDir, "onnx");
        fsSync.mkdirSync(snapshotOnnxDir, { recursive: true });
        for (const ent of fsSync.readdirSync(onnxDir, { withFileTypes: true })) {
          if (!ent.isFile()) continue;
          const src = path.join(onnxDir, ent.name);
          const dst = path.join(snapshotOnnxDir, ent.name);
          if (!fsSync.existsSync(dst)) fsSync.copyFileSync(src, dst);
        }
      }
    }

    const pointerPath = path.join(repoDir, "snapshots", commitHash, "onnx", "model.onnx");
    if (fsSync.existsSync(pointerPath)) continue;

    const blobsDir = path.join(repoDir, "blobs");
    if (!fsSync.existsSync(blobsDir)) continue;

    const blobCandidates = fsSync
      .readdirSync(blobsDir, { withFileTypes: true })
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
        const size = fsSync.statSync(p).size;
        if (size > bestSize) {
          bestSize = size;
          bestBlob = p;
        }
      } catch {
        continue;
      }
    }

    fsSync.mkdirSync(path.dirname(pointerPath), { recursive: true });
    fsSync.copyFileSync(bestBlob, pointerPath);
  }
}

async function test() {
  try {
    const onnxPath = getOnnxRuntimePath();
    process.env.ORT_DYLIB_PATH = onnxPath;

    const arg0 = String(process.argv[2] || "").trim().toLowerCase();
    if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = "https://hf-mirror.com";

    const usePreset =
      !arg0 ||
      arg0 === "fast" ||
      arg0 === "balanced" ||
      arg0 === "quality" ||
      arg0 === "multilingual" ||
      arg0 === "compact" ||
      arg0 === "large" ||
      arg0 === "accurate";

    const cacheDirFromEnv = String(process.env.KREUZBERG_CACHE_DIR || "").trim();
    const cacheDir = path.resolve(process.cwd(), cacheDirFromEnv || ".cache/models");
    if (!fsSync.existsSync(cacheDir)) fsSync.mkdirSync(cacheDir, { recursive: true });
    repairHfHubCache(cacheDir);

    const text = "Hello world.";
    const buffer = Buffer.from(text, "utf-8");
    const uint8Array = new Uint8Array(buffer);

    let config: any;
    if (usePreset) {
      const preset = arg0 || "fast";
      const presetInfo = getEmbeddingPreset(preset as any);
      if (!presetInfo) {
        console.error(`Unknown embedding preset: ${preset}`);
        return;
      }

      config = {
        chunking: {
          maxChars: 1000,
          embedding: {
            model: {
              modelType: "preset",
              value: preset,
            },
            cacheDir,
            showDownloadProgress: false,
          },
        },
      };

      console.log(`Preset: ${preset} (${presetInfo.modelName}, ${presetInfo.dimensions} dims)`);
      console.log(`Cache dir: ${cacheDir}`);
    } else {
      const modelName = "Xenova/all-MiniLM-L6-v2";
      const modelCacheDir = path.join(cacheDir, "models--" + modelName.replace("/", "--"));
      const requiredFiles = ["config.json", "tokenizer.json", "onnx/model.onnx"];
      const candidates: string[] = [];
      const snapshotsDir = path.join(modelCacheDir, "snapshots");
      if (fsSync.existsSync(snapshotsDir)) {
        const snapshots = fsSync.readdirSync(snapshotsDir);
        for (const s of snapshots) {
          candidates.push(path.join(snapshotsDir, s));
        }
      }
      candidates.push(modelCacheDir);

      const actualModelPath =
        candidates.find((p) => requiredFiles.every((f) => fsSync.existsSync(path.join(p, f)))) ?? modelCacheDir;
      const missingFiles = requiredFiles.filter((f) => !fsSync.existsSync(path.join(actualModelPath, f)));
      if (missingFiles.length > 0) {
        console.error(`Missing required files: ${missingFiles.join(", ")}`);
        console.log(`Download model files first: huggingface-cli download ${modelName} --local-dir ${modelCacheDir} --local-dir-use-symlinks False`);
        return;
      }

      config = {
        chunking: {
          maxChars: 1000,
          embedding: {
            model: {
              modelType: "local",
              value: actualModelPath,
            },
            cacheDir,
            showDownloadProgress: false,
          },
        },
      };

      console.log(`Local model: ${modelName}`);
      console.log(`Model path: ${actualModelPath}`);
      console.log(`Cache dir: ${cacheDir}`);
    }
    
    const result = await extractBytes(uint8Array, "text/plain", config);
    
    if (result.chunks && result.chunks.length > 0 && result.chunks[0].embedding) {
      console.log("Success! Embedding found.");
      console.log(`Embedding dimension: ${result.chunks[0].embedding.length}`);
    } else {
      console.log("Failed: No embedding found.");
      console.log("Result Warnings:", result.processingWarnings);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
