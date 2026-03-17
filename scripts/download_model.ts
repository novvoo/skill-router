import fs from "fs";
import path from "path";
import https from "https";

const modelUrl = "https://hf-mirror.com/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx";
const outputDir = path.resolve(process.cwd(), "models");
const outputPath = path.join(outputDir, "all-MiniLM-L6-v2-quantized.onnx");

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Downloading model from ${modelUrl} to ${outputPath}...`);

const file = fs.createWriteStream(outputPath);

https.get(modelUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`Failed to download model. Status Code: ${response.statusCode}`);
        if (response.headers.location) {
            console.log(`Redirecting to ${response.headers.location}`);
            https.get(response.headers.location, (redirectResponse) => {
                 if (redirectResponse.statusCode !== 200) {
                     console.error(`Failed to download redirected model. Status Code: ${redirectResponse.statusCode}`);
                     return;
                 }
                 redirectResponse.pipe(file);
                 file.on('finish', () => {
                     file.close();
                     console.log("Download completed successfully.");
                 });
            });
        }
        return;
    }

    response.pipe(file);

    file.on('finish', () => {
        file.close();
        console.log("Download completed successfully.");
    });
}).on('error', (err) => {
    fs.unlink(outputPath, () => {}); // Delete the file async. (But we don't check result)
    console.error(`Error downloading file: ${err.message}`);
});
