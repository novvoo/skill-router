import http from "node:http";
import { logger } from "../utils/logger.js";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;
  private enabled: boolean;

  constructor(options: { windowMs?: number; maxRequests?: number; enabled?: boolean } = {}) {
    this.windowMs = options.windowMs || 60000;
    this.maxRequests = options.maxRequests || 100;
    this.enabled = options.enabled !== false;
  }

  private getClientKey(req: http.IncomingMessage): string {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (forwardedFor) {
      const firstIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0].trim();
      return firstIp;
    }
    return req.socket.remoteAddress || "unknown";
  }

  isAllowed(req: http.IncomingMessage): { allowed: boolean; remaining: number; resetTime: number } {
    if (!this.enabled) {
      return { allowed: true, remaining: this.maxRequests, resetTime: Date.now() + this.windowMs };
    }

    const key = this.getClientKey(req);
    const now = Date.now();
    let entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + this.windowMs };
      this.requests.set(key, entry);
    }

    entry.count++;

    if (entry.count > this.maxRequests) {
      logger.warn("Rate limit exceeded", { client: key, count: entry.count });
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    const remaining = this.maxRequests - entry.count;
    return { allowed: true, remaining, resetTime: entry.resetTime };
  }

  applyHeaders(res: http.ServerResponse, result: { allowed: boolean; remaining: number; resetTime: number }): void {
    if (!this.enabled) return;

    res.setHeader("X-RateLimit-Limit", String(this.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetTime / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  startCleanupInterval(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => this.cleanup(), intervalMs);
  }
}
