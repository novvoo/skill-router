import { format } from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private level: LogLevel;
  private entries: LogEntry[] = [];
  private maxEntries: number = 1000;
  private outputToConsole: boolean = true;

  constructor(options: { level?: LogLevel; maxEntries?: number; outputToConsole?: boolean } = {}) {
    this.level = options.level || "info";
    this.maxEntries = options.maxEntries || 1000;
    this.outputToConsole = options.outputToConsole !== false;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padStart(5);
    let msg = `[${timestamp}] [${levelStr}] ${message}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      try {
        msg += ` | metadata=${JSON.stringify(metadata)}`;
      } catch {
        msg += " | metadata=<circular>";
      }
    }
    
    if (error) {
      msg += `\n${error.stack || error.message}`;
    }
    
    return msg;
  }

  private addEntry(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  log(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      error,
    };

    this.addEntry(entry);

    if (this.outputToConsole) {
      const formatted = this.formatMessage(level, message, metadata, error);
      const consoleMethod = level === "debug" ? console.debug : 
                            level === "info" ? console.info :
                            level === "warn" ? console.warn : console.error;
      consoleMethod(formatted);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata, error);
  }

  getEntries(options: { level?: LogLevel; limit?: number; since?: Date } = {}): LogEntry[] {
    let entries = [...this.entries];

    if (options.level) {
      const level = options.level;
      entries = entries.filter(e => LOG_LEVELS[e.level] >= LOG_LEVELS[level]);
    }

    if (options.since) {
      const sinceDate = options.since;
      entries = entries.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (options.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  clear(): void {
    this.entries = [];
  }
}

const defaultLogger = new Logger({ 
  level: (process.env.LOG_LEVEL as LogLevel) || "info" 
});

export { Logger, defaultLogger as logger };
