import path from "node:path";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

async function main() {
  const root = process.cwd();
  const outFile = path.resolve(root, "public", "vendor", "highlight.js", "common.js");
  await mkdir(path.dirname(outFile), { recursive: true });

  await build({
    entryPoints: [path.resolve(root, "node_modules", "highlight.js", "lib", "common.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    outfile: outFile,
    logLevel: "silent",
  });

  process.stdout.write("vendor: ok\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exitCode = 1;
});
