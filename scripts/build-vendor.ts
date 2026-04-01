import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { build } from "esbuild";

async function main() {
  const root = process.cwd();
  const vendorDir = path.resolve(root, "public", "vendor");
  
  // 创建vendor目录结构
  await mkdir(path.resolve(vendorDir, "highlight.js", "es"), { recursive: true });
  await mkdir(path.resolve(vendorDir, "highlight.js", "styles"), { recursive: true });
  await mkdir(path.resolve(vendorDir, "marked", "lib"), { recursive: true });
  await mkdir(path.resolve(vendorDir, "dompurify", "dist"), { recursive: true });

  // 构建highlight.js
  await build({
    entryPoints: [path.resolve(root, "node_modules", "highlight.js", "lib", "common.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    outfile: path.resolve(vendorDir, "highlight.js", "es", "common.js"),
    logLevel: "silent",
  });

  // 复制highlight.js样式文件
  await copyFile(
    path.resolve(root, "node_modules", "highlight.js", "styles", "github-dark.css"),
    path.resolve(vendorDir, "highlight.js", "styles", "github-dark.css")
  );

  // 复制marked文件
  await copyFile(
    path.resolve(root, "node_modules", "marked", "lib", "marked.esm.js"),
    path.resolve(vendorDir, "marked", "lib", "marked.esm.js")
  );

  // 复制dompurify文件
  await copyFile(
    path.resolve(root, "node_modules", "dompurify", "dist", "purify.es.mjs"),
    path.resolve(vendorDir, "dompurify", "dist", "purify.es.mjs")
  );

  process.stdout.write("vendor: all files built successfully\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
