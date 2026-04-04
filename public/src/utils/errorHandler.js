// Production-grade error handling system
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(message, { code = 'UNKNOWN_ERROR', statusCode = 500, details = null, cause = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
    this.timestamp = new Date().toISOString();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details
    });
  }
}

export class NetworkError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: 'NETWORK_ERROR',
      statusCode: 503,
      details
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: 'NOT_FOUND',
      statusCode: 404,
      details
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message, details = null) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      details
    });
  }
}

export class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      showUserFriendlyMessages: true,
      logErrors: true,
      reportErrors: options.reportErrors || false,
      errorReporter: options.errorReporter || null,
      onError: options.onError || null,
      ...options
    };
    
    this.errorHistory = [];
    this.maxErrorHistory = options.maxErrorHistory || 100;
    this.listeners = new Map();
    
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    window.addEventListener('error', (event) => {
      this.handleError(event.error || event.reason, {
        source: 'window.onerror',
        event
      });
      event.preventDefault();
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, {
        source: 'unhandledrejection',
        event
      });
      event.preventDefault();
    });

    if (typeof console !== 'undefined') {
      const originalError = console.error;
      console.error = (...args) => {
        originalError.apply(console, args);
        const error = args.find(arg => arg instanceof Error);
        if (error) {
          this.handleError(error, { source: 'console.error' });
        }
      };
    }
  }

  handleError(error, context = {}) {
    const normalizedError = this.normalizeError(error);
    
    const errorInfo = {
      error: normalizedError,
      context,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.errorHistory.push(errorInfo);
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }

    if (this.options.logErrors) {
      this.logError(errorInfo);
    }

    if (this.options.reportErrors && this.options.errorReporter) {
      this.reportError(errorInfo);
    }

    if (this.options.onError) {
      this.options.onError(errorInfo);
    }

    this.emit('error', errorInfo);

    return errorInfo;
  }

  normalizeError(error) {
    if (error instanceof AppError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new AppError(error.message, {
        code: error.name || 'UNKNOWN_ERROR',
        cause: error,
        details: { stack: error.stack }
      });
    }

    return new AppError(String(error), {
      details: { originalError: error }
    });
  }

  logError(errorInfo) {
    const { error, context, timestamp } = errorInfo;
    logger.error(
      `[${timestamp}] ${error.code}: ${error.message}`,
      { context, details: error.details, stack: error.stack }
    );
  }

  async reportError(errorInfo) {
    if (!this.options.errorReporter) return;
    
    try {
      await this.options.errorReporter(errorInfo);
    } catch (reportError) {
      logger.error('Failed to report error:', reportError);
    }
  }

  getUserFriendlyMessage(error) {
    const messages = {
      'VALIDATION_ERROR': '请检查输入的信息是否正确。',
      'NETWORK_ERROR': '网络连接失败，请检查网络后重试。',
      'NOT_FOUND': '请求的资源不存在。',
      'UNAUTHORIZED': '请先登录后再操作。',
      'UNKNOWN_ERROR': '发生了未知错误，请稍后重试。'
    };
    
    return messages[error.code] || messages['UNKNOWN_ERROR'];
  }

  getErrors(options = {}) {
    let errors = [...this.errorHistory];
    
    if (options.since) {
      errors = errors.filter(e => new Date(e.timestamp) >= new Date(options.since));
    }
    
    if (options.limit) {
      errors = errors.slice(-options.limit);
    }
    
    return errors;
  }

  clearErrors() {
    this.errorHistory = [];
    this.emit('clear');
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

  wrapAsync(fn, errorHandler = null) {
    return async (...args) => {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        const errorInfo = this.handleError(error, {
          source: 'wrappedAsync',
          functionName: fn.name
        });
        
        if (errorHandler) {
          return errorHandler(errorInfo);
        }
        
        throw errorInfo.error;
      }
    };
  }

  wrapSync(fn, errorHandler = null) {
    return (...args) => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        const errorInfo = this.handleError(error, {
          source: 'wrappedSync',
          functionName: fn.name
        });
        
        if (errorHandler) {
          return errorHandler(errorInfo);
        }
        
        throw errorInfo.error;
      }
    };
  }

  createErrorBoundary(options = {}) {
    const { onError, fallback = null } = options;
    
    return {
      wrap: (component) => {
        return (...args) => {
          try {
            return component.apply(this, args);
          } catch (error) {
            const errorInfo = this.handleError(error, {
              source: 'errorBoundary'
            });
            
            if (onError) {
              onError(errorInfo);
            }
            
            return typeof fallback === 'function' 
              ? fallback(errorInfo) 
              : fallback;
          }
        };
      }
    };
  }

  destroy() {
    this.listeners.clear();
    this.clearErrors();
  }
}

let defaultErrorHandler = null;

export function initErrorHandler(options = {}) {
  defaultErrorHandler = new ErrorHandler(options);
  return defaultErrorHandler;
}

export function getErrorHandler() {
  if (!defaultErrorHandler) {
    defaultErrorHandler = new ErrorHandler();
  }
  return defaultErrorHandler;
}

export { defaultErrorHandler };
