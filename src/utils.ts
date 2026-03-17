import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function getOnnxRuntimePath(): string {
  try {
    const packagePath = require.resolve("onnxruntime-node/package.json");
    const packageDir = path.dirname(packagePath);
    const binDir = path.join(packageDir, "bin", "napi-v6", process.platform, process.arch);

    if (!fs.existsSync(binDir)) {
        throw new Error(`OnnxRuntime binary directory not found: ${binDir}`);
    }

    const files = fs.readdirSync(binDir);
    let libName: string | undefined;

    if (process.platform === "win32") {
      libName = files.find(f => f === "onnxruntime.dll");
    } else if (process.platform === "darwin") {
      libName = files.find(f => f.startsWith("libonnxruntime") && f.endsWith(".dylib"));
    } else if (process.platform === "linux") {
      libName = files.find(f => f.startsWith("libonnxruntime.so"));
    }

    if (!libName) {
      throw new Error(`Could not find onnxruntime library in ${binDir}`);
    }

    return path.join(binDir, libName);
  } catch (error) {
    console.warn("Failed to resolve onnxruntime-node path automatically, falling back to hardcoded path.");
    // Fallback to the original hardcoded logic if something goes wrong, 
    // though this might still fail if the platform doesn't match the hardcoded one.
    return path.resolve(process.cwd(), "node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll");
  }
}
