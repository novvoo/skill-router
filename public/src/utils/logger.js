// Production-grade logging system
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.INFO;
    this.prefix = options.prefix || '';
    this.maxLogEntries = options.maxLogEntries || 1000;
    this.logEntries = [];
    this.listeners = new Map();
    this.consoleEnabled = options.consoleEnabled !== false;
    this.persistToStorage = options.persistToStorage || false;
    this.storageKey = options.storageKey || 'app-logs';
    
    if (this.persistToStorage) {
      this.loadFromStorage();
    }
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  getLevel() {
    return this.level;
  }

  shouldLog(level) {
    return level >= this.level;
  }

  formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const levelStr = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    return {
      timestamp,
      level: levelStr,
      message: args.map(arg => {
        if (arg instanceof Error) {
          return {
            message: arg.message,
            stack: arg.stack,
            name: arg.name
          };
        }
        if (typeof arg === 'object') {
          try {
            return JSON.parse(JSON.stringify(arg));
          } catch {
            return String(arg);
          }
        }
        return arg;
      }),
      prefix: this.prefix
    };
  }

  log(level, ...args) {
    if (!this.shouldLog(level)) return;

    const entry = this.formatMessage(level, ...args);
    this.addEntry(entry);

    if (this.consoleEnabled) {
      this.logToConsole(level, entry);
    }

    this.emit('log', entry);
  }

  addEntry(entry) {
    this.logEntries.push(entry);
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.shift();
    }
    if (this.persistToStorage) {
      this.saveToStorage();
    }
  }

  logToConsole(level, entry) {
    const consoleMethod = this.getConsoleMethod(level);
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    const timestamp = entry.timestamp;
    
    if (console[consoleMethod]) {
      const messages = entry.message.map(m => {
        if (m && typeof m === 'object' && m.stack) {
          return `${m.name}: ${m.message}\n${m.stack}`;
        }
        return m;
      });
      console[consoleMethod](`[${timestamp}]${prefix}`, ...messages);
    }
  }

  getConsoleMethod(level) {
    switch (level) {
      case LOG_LEVELS.DEBUG: return 'debug';
      case LOG_LEVELS.INFO: return 'info';
      case LOG_LEVELS.WARN: return 'warn';
      case LOG_LEVELS.ERROR: return 'error';
      default: return 'log';
    }
  }

  debug(...args) {
    this.log(LOG_LEVELS.DEBUG, ...args);
  }

  info(...args) {
    this.log(LOG_LEVELS.INFO, ...args);
  }

  warn(...args) {
    this.log(LOG_LEVELS.WARN, ...args);
  }

  error(...args) {
    this.log(LOG_LEVELS.ERROR, ...args);
  }

  getLogs(options = {}) {
    let logs = [...this.logEntries];
    
    if (options.level) {
      const levelFilter = typeof options.level === 'string' 
        ? LOG_LEVELS[options.level.toUpperCase()] 
        : options.level;
      logs = logs.filter(log => LOG_LEVELS[log.level] >= levelFilter);
    }
    
    if (options.since) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(options.since));
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs;
  }

  clearLogs() {
    this.logEntries = [];
    if (this.persistToStorage) {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (e) {
        this.warn('Failed to clear logs from storage:', e);
      }
    }
    this.emit('clear');
  }

  saveToStorage() {
    try {
      const recentLogs = this.logEntries.slice(-100);
      localStorage.setItem(this.storageKey, JSON.stringify(recentLogs));
    } catch (e) {
      this.warn('Failed to save logs to storage:', e);
    }
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logEntries = JSON.parse(stored);
      }
    } catch (e) {
      this.warn('Failed to load logs from storage:', e);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  exportLogs(format = 'json') {
    const logs = this.getLogs();
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else if (format === 'text') {
      return logs.map(log => 
        `[${log.timestamp}] [${log.level}] ${log.message.map(m => 
          typeof m === 'object' ? JSON.stringify(m) : m
        ).join(' ')}`
      ).join('\n');
    }
    return logs;
  }

  createChild(prefix) {
    const childLogger = new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      consoleEnabled: this.consoleEnabled,
      persistToStorage: false
    });
    childLogger.parent = this;
    return childLogger;
  }
}

const defaultLogger = new Logger({ prefix: 'App' });

export { Logger, LOG_LEVELS, defaultLogger as logger };
