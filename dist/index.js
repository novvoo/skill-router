import http from "node:http";
import { handleRequest } from "./handler.js";
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
async function main() {
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
    process.stdout.write(`listening on http://${host}:${usedPort}\n`);
}
main().catch((e) => {
    process.stderr.write(String(e?.stack || e) + "\n");
    process.exitCode = 1;
});
