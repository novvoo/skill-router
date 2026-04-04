export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  resetTimeoutMs: number;
  rollingWindowMs: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTimeouts: number;
  totalRejections: number;
  failureRate: number;
  currentWindow: {
    failures: number;
    successes: number;
    total: number;
  };
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreakerOpenError extends CircuitBreakerError {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30000,
  resetTimeoutMs: 60000,
  rollingWindowMs: 10000,
};

class FailureTracker {
  private timestamps: number[] = [];
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  addFailure(timestamp: number = Date.now()): void {
    this.timestamps.push(timestamp);
    this.cleanup();
  }

  addSuccess(timestamp: number = Date.now()): void {
    this.cleanup();
  }

  getFailureCount(): number {
    this.cleanup();
    return this.timestamps.length;
  }

  getSuccessCount(): number {
    this.cleanup();
    return 0;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private options: CircuitBreakerOptions;
  private failureTracker: FailureTracker;
  private successCountInHalfOpen: number = 0;
  private lastFailureTime: number = 0;
  private metrics: Omit<CircuitBreakerMetrics, 'state' | 'failureRate' | 'currentWindow'> = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTimeouts: 0,
    totalRejections: 0,
  };
  private name: string;
  private fallbackFn?: (...args: any[]) => any;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.failureTracker = new FailureTracker(this.options.rollingWindowMs);
  }

  setFallback(fn: (...args: any[]) => any): this {
    this.fallbackFn = fn;
    return this;
  }

  async execute<T>(
    fn: () => Promise<T>,
    ...args: any[]
  ): Promise<T> {
    this.metrics.totalRequests++;

    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCountInHalfOpen = 0;
      } else {
        this.metrics.totalRejections++;
        if (this.fallbackFn) {
          return this.fallbackFn(...args);
        }
        throw new CircuitBreakerOpenError();
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      
      this.onSuccess();
      return result;
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        throw error;
      }
      
      this.onFailure(error);
      
      if (this.fallbackFn) {
        return this.fallbackFn(...args);
      }
      
      throw error;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            this.metrics.totalTimeouts++;
            reject(new CircuitBreakerError('Operation timed out'));
          }, this.options.timeoutMs);
        }),
      ]);
      
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private onSuccess(): void {
    this.metrics.successfulRequests++;
    this.failureTracker.addSuccess();

    if (this.state === 'half-open') {
      this.successCountInHalfOpen++;
      if (this.successCountInHalfOpen >= this.options.successThreshold) {
        this.state = 'closed';
        this.successCountInHalfOpen = 0;
      }
    }
  }

  private onFailure(error: any): void {
    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();
    this.failureTracker.addFailure();

    if (this.state === 'closed') {
      const failureCount = this.failureTracker.getFailureCount();
      if (failureCount >= this.options.failureThreshold) {
        this.state = 'open';
      }
    } else if (this.state === 'half-open') {
      this.state = 'open';
      this.successCountInHalfOpen = 0;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    const failureCount = this.failureTracker.getFailureCount();
    const totalInWindow = failureCount;
    const failureRate = totalInWindow > 0 ? (failureCount / totalInWindow) * 100 : 0;

    return {
      state: this.state,
      ...this.metrics,
      failureRate,
      currentWindow: {
        failures: failureCount,
        successes: 0,
        total: totalInWindow,
      },
    };
  }

  reset(): void {
    this.state = 'closed';
    this.successCountInHalfOpen = 0;
    this.lastFailureTime = 0;
    this.failureTracker = new FailureTracker(this.options.rollingWindowMs);
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTimeouts: 0,
      totalRejections: 0,
    };
  }

  forceState(state: CircuitState): void {
    this.state = state;
    if (state === 'closed') {
      this.successCountInHalfOpen = 0;
      this.failureTracker = new FailureTracker(this.options.rollingWindowMs);
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
    } else {
      this.breakers.forEach(breaker => breaker.reset());
    }
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
