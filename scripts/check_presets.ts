import { listEmbeddingPresets, getEmbeddingPreset } from "@kreuzberg/node";

const presets = listEmbeddingPresets();
console.log("Available presets:", presets);

for (const name of presets) {
    const preset = getEmbeddingPreset(name);
    if (preset) {
        console.log(`\nPreset: ${name}`);
        console.log(`  Model Name: ${preset.modelName}`);
        console.log(`  Dimensions: ${preset.dimensions}`);
        console.log(`  Description: ${preset.description}`);
    }
}
