import http from "node:http";
import { handleRequest } from "./handler.js";
import { getOnnxRuntimePath } from "./utils.js";
import { TerminalUI } from "./terminal/TerminalUI.js";
import { AgentManager } from "./agents/AgentManager.js";
import { logger } from "./utils/logger.js";
import { config } from "./utils/config.js";
import { healthChecker } from "./utils/healthCheck.js";
import { RateLimiter } from "./middleware/rateLimiter.js";
import { applySecurityHeaders } from "./middleware/securityHeaders.js";

// Configure ONNX Runtime path for Kreuzberg
const onnxPath = getOnnxRuntimePath();
process.env.ORT_DYLIB_PATH = onnxPath;
logger.info(`Configured ORT_DYLIB_PATH: ${onnxPath}`);

// Parse command line arguments
const args = process.argv.slice(2);
const isTerminalMode = args.includes('--terminal') || args.includes('-t');
const isCoordinatorMode = args.includes('--coordinator') || args.includes('-c');

// Initialize rate limiter
const rateLimiter = new RateLimiter({
  enabled: config.get("rateLimitEnabled") as boolean,
  windowMs: config.get("rateLimitWindowMs") as number,
  maxRequests: config.get("rateLimitMaxRequests") as number,
});
const cleanupInterval = rateLimiter.startCleanupInterval();

function listen(server: http.Server, host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function createRequestHandler(originalHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown>) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const startTime = Date.now();
    const method = req.method;
    const url = req.url;

    try {
      // Health check endpoint
      if (url === "/health" || url === "/healthz" || url === "/ready") {
        const healthHandler = healthChecker.createHandler();
        await healthHandler(req, res);
        return;
      }

      // Rate limiting
      const rateLimitResult = rateLimiter.isAllowed(req);
      rateLimiter.applyHeaders(res, rateLimitResult);

      if (!rateLimitResult.allowed) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          error: "Too Many Requests",
          message: "Rate limit exceeded",
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        }));
        return;
      }

      // Apply security headers
      applySecurityHeaders(res);

      // Original request handler
      await originalHandler(req, res);
    } catch (error) {
      logger.error("Request handling failed", error instanceof Error ? error : undefined, { method, url });
      
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          error: "Internal Server Error",
          message: "An unexpected error occurred",
        }));
      }
    } finally {
      const duration = Date.now() - startTime;
      logger.info("Request completed", { method, url, statusCode: res.statusCode, durationMs: duration });
    }
  };
}

async function startServer() {
  const appConfig = config.getConfig();
  const server = http.createServer(createRequestHandler(handleRequest));

  let port = appConfig.port;
  for (let i = 0; i < 20; i++) {
    try {
      await listen(server, appConfig.host, port);
      break;
    } catch (e: any) {
      if (e?.code === "EADDRINUSE") {
        logger.warn(`Port ${port} in use, trying ${port + 1}`);
        port++;
        continue;
      }
      throw e;
    }
  }

  const addr = server.address();
  const usedPort = typeof addr === "object" && addr ? addr.port : port;
  
  return { server, port: usedPort, host: appConfig.host };
}

function setupGracefulShutdown(server: http.Server) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Cleanup rate limiter
    clearInterval(cleanupInterval);

    // Give some time for ongoing requests to complete
    const shutdownTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 30000);

    try {
      logger.info("Graceful shutdown completed");
      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown", error instanceof Error ? error : undefined);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    if (!isShuttingDown) {
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection", reason instanceof Error ? reason : undefined, { promise });
  });
}

async function main() {
  // Set log level from config
  logger.setLevel(config.get("logLevel") as any);

  // Check config validity
  if (!config.isValidConfig()) {
    logger.error("Invalid configuration, exiting");
    for (const error of config.getValidationErrors()) {
      logger.error(error);
    }
    process.exit(1);
  }

  // Initialize Agent system
  const agentManager = AgentManager.getInstance();
  await agentManager.loadAgents('./agent/agents');

  if (isTerminalMode) {
    // Start terminal mode
    logger.info('Starting Skill-Router in terminal mode...');
    logger.info(`Agent system enabled (${agentManager.getAvailableAgents().length} agents loaded)`);
    if (isCoordinatorMode) {
      logger.info('Coordinator mode active');
    }
    
    // Get OpenAI config from environment variables
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim();
    const model = String(process.env.OPENAI_MODEL || "").trim();
    
    if (apiKey && baseUrl && model) {
      logger.info('OpenAI configuration loaded from environment variables');
    } else {
      logger.warn('OpenAI configuration not found in environment variables');
      logger.warn('Tools will not be available without proper OpenAI configuration');
    }
    
    const terminal = new TerminalUI();
    await terminal.startInteractiveMode({ apiKey, baseUrl, model });
  } else {
    // Start HTTP server mode
    const { server, port, host } = await startServer();
    
    setupGracefulShutdown(server);
    
    logger.info(`Skill-Router server running on http://${host}:${port}`);
    logger.info(`Agent system enabled (${agentManager.getAvailableAgents().length} agents loaded)`);
    logger.info(`Health check: http://${host}:${port}/health`);
    if (isCoordinatorMode) {
      logger.info('Coordinator mode active');
    }
    logger.info(`Web interface: http://${host}:${port}`);
  }
}

main().catch((e) => {
  logger.error("Fatal error during startup", e instanceof Error ? e : undefined);
  process.exitCode = 1;
});
