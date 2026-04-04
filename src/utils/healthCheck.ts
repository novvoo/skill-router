import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";
import os from "node:os";

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; message?: string; details?: Record<string, unknown> }>;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: Record<string, { healthy: boolean; message?: string; details?: Record<string, unknown>; duration: number }>;
  version?: string;
  system?: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
    totalMemory: number;
    freeMemory: number;
    loadAverage: number[];
  };
}

export interface Metric {
  name: string;
  type: "counter" | "gauge" | "histogram" | "summary";
  value: number | string;
  labels?: Record<string, string>;
  help?: string;
}

class HealthChecker {
  private checks: Map<string, HealthCheck> = new Map();
  private startTime: number = Date.now();
  private version?: string;
  private metrics: Map<string, Metric> = new Map();
  private metricCounters: Map<string, number> = new Map();
  private metricHistograms: Map<string, number[]> = new Map();

  constructor() {
    this.loadVersion();
    this.registerDefaultChecks();
    this.registerDefaultMetrics();
  }

  private loadVersion(): void {
    try {
      const pkgPath = path.resolve(process.cwd(), "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        this.version = pkg.version;
      }
    } catch {
      this.version = "unknown";
    }
  }

  private registerDefaultChecks(): void {
    this.registerCheck("memory", async () => {
      const mem = process.memoryUsage();
      const totalMem = os.totalmem();
      const usedMem = totalMem - os.freemem();
      const memoryUsagePercent = (usedMem / totalMem) * 100;
      const healthy = memoryUsagePercent < 90;
      
      return {
        healthy,
        message: healthy ? "Memory usage is normal" : "Memory usage is high",
        details: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers,
          systemTotal: totalMem,
          systemUsed: usedMem,
          systemFree: os.freemem(),
          usagePercent: Math.round(memoryUsagePercent * 100) / 100,
        },
      };
    });

    this.registerCheck("skills", async () => {
      const catalogPath = path.resolve(process.cwd(), "agent/skills/CATALOG.md");
      const agentsPath = path.resolve(process.cwd(), "agent/agents");
      const healthy = existsSync(catalogPath) && existsSync(agentsPath);
      return {
        healthy,
        message: healthy ? "Skills and agents are available" : "Skills or agents not found",
        details: {
          catalogPath,
          agentsPath,
          catalogExists: existsSync(catalogPath),
          agentsExists: existsSync(agentsPath),
        },
      };
    });

    this.registerCheck("uptime", async () => {
      return {
        healthy: true,
        details: {
          seconds: Math.floor((Date.now() - this.startTime) / 1000),
          minutes: Math.floor((Date.now() - this.startTime) / 60000),
          hours: Math.floor((Date.now() - this.startTime) / 3600000),
        },
      };
    });

    this.registerCheck("disk", async () => {
      try {
        const cwd = process.cwd();
        const healthy = existsSync(cwd);
        return {
          healthy,
          message: healthy ? "Disk access is working" : "Cannot access working directory",
          details: {
            cwd,
            exists: healthy,
          },
        };
      } catch (error) {
        return {
          healthy: false,
          message: error instanceof Error ? error.message : "Disk check failed",
        };
      }
    });

    this.registerCheck("cpu", async () => {
      const cpus = os.cpus();
      const loadAverage = os.loadavg();
      const healthy = loadAverage[0] < cpus.length * 2;
      
      return {
        healthy,
        message: healthy ? "CPU usage is normal" : "CPU usage is high",
        details: {
          cpuCount: cpus.length,
          loadAverage1m: loadAverage[0],
          loadAverage5m: loadAverage[1],
          loadAverage15m: loadAverage[2],
        },
      };
    });
  }

  private registerDefaultMetrics(): void {
    this.setGauge("process_start_time_seconds", Math.floor(this.startTime / 1000));
  }

  registerCheck(name: string, check: HealthCheck["check"]): void {
    this.checks.set(name, { name, check });
  }

  async checkHealth(): Promise<HealthStatus> {
    const checks: HealthStatus["checks"] = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const [name, check] of this.checks) {
      totalCount++;
      const start = Date.now();
      try {
        const result = await check.check();
        const duration = Date.now() - start;
        checks[name] = { ...result, duration };
        if (result.healthy) healthyCount++;
        
        this.recordHistogram(`health_check_duration_seconds`, duration / 1000);
        this.incrementCounter(`health_check_total`, { check: name, status: result.healthy ? "success" : "failure" });
      } catch (error) {
        const duration = Date.now() - start;
        checks[name] = {
          healthy: false,
          message: error instanceof Error ? error.message : "Check failed",
          duration,
        };
        
        this.recordHistogram(`health_check_duration_seconds`, duration / 1000);
        this.incrementCounter(`health_check_total`, { check: name, status: "error" });
      }
    }

    let status: HealthStatus["status"] = "healthy";
    if (healthyCount < totalCount) {
      status = healthyCount === 0 ? "unhealthy" : "degraded";
    }

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
      version: this.version,
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg(),
      },
    };

    logger.debug("Health check completed", { status, healthyCount, totalCount });
    this.setGauge("up", status === "healthy" ? 1 : 0);

    return healthStatus;
  }

  createHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
    return async (_req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const health = await this.checkHealth();
        const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
        
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(JSON.stringify(health, null, 2));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
    };
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.metricKey(name, labels);
    const current = this.metricCounters.get(key) || 0;
    this.metricCounters.set(key, current + 1);
    this.metrics.set(key, {
      name,
      type: "counter",
      value: current + 1,
      labels,
    });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.metricKey(name, labels);
    this.metrics.set(key, {
      name,
      type: "gauge",
      value,
      labels,
    });
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.metricKey(name, labels);
    const history = this.metricHistograms.get(key) || [];
    history.push(value);
    if (history.length > 1000) history.shift();
    this.metricHistograms.set(key, history);
    
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    this.metrics.set(key, {
      name,
      type: "histogram",
      value: avg,
      labels,
      help: `Average of last ${history.length} samples`,
    });
  }

  private metricKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  getMetrics(): Metric[] {
    const mem = process.memoryUsage();
    this.setGauge("process_memory_heap_bytes", mem.heapUsed);
    this.setGauge("process_memory_heap_total_bytes", mem.heapTotal);
    this.setGauge("process_memory_rss_bytes", mem.rss);
    this.setGauge("process_cpu_seconds_total", process.uptime());
    this.setGauge("process_open_fds", process.getActiveResourcesInfo ? process.getActiveResourcesInfo().length : 0);
    
    return Array.from(this.metrics.values());
  }

  getMetricsAsPrometheus(): string {
    const metrics = this.getMetrics();
    let output = "";
    
    for (const metric of metrics) {
      if (metric.help) {
        output += `# HELP ${metric.name} ${metric.help}\n`;
      }
      output += `# TYPE ${metric.name} ${metric.type}\n`;
      
      const labelStr = metric.labels 
        ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`
        : "";
      
      output += `${metric.name}${labelStr} ${metric.value}\n`;
    }
    
    return output;
  }

  createMetricsHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.end(this.getMetricsAsPrometheus());
    };
  }

  resetMetrics(): void {
    this.metrics.clear();
    this.metricCounters.clear();
    this.metricHistograms.clear();
    this.registerDefaultMetrics();
  }
}

const healthChecker = new HealthChecker();

export { HealthChecker, healthChecker };

