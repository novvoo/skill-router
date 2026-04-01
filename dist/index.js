import http from "node:http";
import { handleRequest } from "./handler.js";
import { getOnnxRuntimePath } from "./utils.js";
import { TerminalUI } from "./terminal/TerminalUI.js";
import { AgentManager } from "./agents/AgentManager.js";
// Configure ONNX Runtime path for Kreuzberg
const onnxPath = getOnnxRuntimePath();
process.env.ORT_DYLIB_PATH = onnxPath;
console.log(`Configured ORT_DYLIB_PATH: ${onnxPath}`);
// Parse command line arguments
const args = process.argv.slice(2);
const isTerminalMode = args.includes('--terminal') || args.includes('-t');
const isCoordinatorMode = args.includes('--coordinator') || args.includes('-c');
const host = "127.0.0.1";
const startPort = Number(process.env.PORT || "8080") || 8080;
function listen(server, port) {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });
}
async function startServer() {
    const server = http.createServer((req, res) => {
        void handleRequest(req, res);
    });
    let port = startPort;
    for (let i = 0; i < 20; i++) {
        try {
            await listen(server, port);
            break;
        }
        catch (e) {
            if (e?.code === "EADDRINUSE") {
                port++;
                continue;
            }
            throw e;
        }
    }
    const addr = server.address();
    const usedPort = typeof addr === "object" && addr ? addr.port : port;
    return { server, port: usedPort };
}
async function main() {
    // Initialize Agent system
    const agentManager = AgentManager.getInstance();
    await agentManager.loadAgents('./agent/agents');
    if (isTerminalMode) {
        // Start terminal mode
        console.log('🚀 Starting Skill-Router in terminal mode...');
        console.log(`📡 Agent system enabled (${agentManager.getAvailableAgents().length} agents loaded)`);
        if (isCoordinatorMode) {
            console.log(`🎯 Coordinator mode active`);
        }
        console.log('');
        // Get OpenAI config from environment variables
        const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
        const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim();
        const model = String(process.env.OPENAI_MODEL || "").trim();
        if (apiKey && baseUrl && model) {
            console.log(`🔧 OpenAI configuration loaded from environment variables`);
        }
        else {
            console.warn(`⚠️  OpenAI configuration not found in environment variables`);
            console.warn(`   Tools will not be available without proper OpenAI configuration`);
        }
        const terminal = new TerminalUI();
        await terminal.startInteractiveMode({ apiKey, baseUrl, model });
    }
    else {
        // Start HTTP server mode
        const { server, port } = await startServer();
        console.log(`🚀 Skill-Router server running on http://${host}:${port}`);
        console.log(`📡 Agent system enabled (${agentManager.getAvailableAgents().length} agents loaded)`);
        if (isCoordinatorMode) {
            console.log(`🎯 Coordinator mode active`);
        }
        console.log(`🌐 Web interface: http://${host}:${port}`);
    }
}
main().catch((e) => {
    process.stderr.write(String(e?.stack || e) + "\n");
    process.exitCode = 1;
});
