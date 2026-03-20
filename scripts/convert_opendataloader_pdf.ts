import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { convert } from "@opendataloader/pdf";

function parseArgs(argv: string[]) {
  const inputs: string[] = [];
  let outputDir = "output/opendataloader-pdf";
  let format = "markdown,json";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--outputDir" || a === "--output-dir") {
      outputDir = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (a === "--format") {
      format = String(argv[i + 1] || "");
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    inputs.push(a);
  }

  return { inputs, outputDir, format };
}

async function main() {
  const { inputs, outputDir, format } = parseArgs(process.argv.slice(2));
  const resolvedInputs = (inputs.length ? inputs : ["example/hacpo.pdf"]).map((p) =>
    path.isAbsolute(p) ? p : path.resolve(process.cwd(), p),
  );
  const resolvedOutputDir = path.isAbsolute(outputDir) ? outputDir : path.resolve(process.cwd(), outputDir);

  await mkdir(resolvedOutputDir, { recursive: true });
  await convert(resolvedInputs, { outputDir: resolvedOutputDir, format });
  process.stdout.write(`converted ${resolvedInputs.length} input(s) to ${resolvedOutputDir}\n`);
}

await main();
