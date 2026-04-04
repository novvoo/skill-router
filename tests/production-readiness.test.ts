import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { SecurityManager, validateInput, FileReadInputSchema } from '../src/utils/security.js';
import { CircuitBreaker, circuitBreakerRegistry } from '../src/utils/circuitBreaker.js';
import { ConfigValidator } from '../src/utils/configValidation.js';
import { healthChecker } from '../src/utils/healthCheck.js';

describe('Production Readiness Tests', () => {
  describe('Security Manager', () => {
    it('should validate allowed paths', () => {
      const securityManager = new SecurityManager({
        allowedPaths: [process.cwd()],
        enablePathValidation: true
      });
      
      const result = securityManager.validatePath(__filename);
      expect(result.valid).toBe(true);
    });

    it('should reject paths outside allowed list', () => {
      const securityManager = new SecurityManager({
        allowedPaths: ['/safe/path'],
        enablePathValidation: true
      });
      
      const result = securityManager.validatePath('/etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('should validate inputs with schema', () => {
      const result = validateInput(FileReadInputSchema, { path: 'test.txt' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid inputs', () => {
      const result = validateInput(FileReadInputSchema, { path: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(() => {
      circuitBreakerRegistry.reset();
    });

    it('should execute successful operations', async () => {
      const breaker = circuitBreakerRegistry.getOrCreate('test');
      
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('should open after failure threshold', async () => {
      const breaker = circuitBreakerRegistry.getOrCreate('failing', {
        failureThreshold: 2,
        resetTimeoutMs: 1000
      });

      await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      
      expect(breaker.getState()).toBe('open');
    });

    it('should use fallback when open', async () => {
      const breaker = circuitBreakerRegistry.getOrCreate('fallback', {
        failureThreshold: 1,
        resetTimeoutMs: 1000
      }).setFallback(() => 'fallback');

      await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      
      const result = await breaker.execute(async () => 'should not reach');
      expect(result).toBe('fallback');
    });
  });

  describe('Config Validation', () => {
    it('should validate valid config', () => {
      const validator = new ConfigValidator({
        server: { port: 8080 },
        security: { enableRateLimiting: true }
      });
      
      const result = validator.validate();
      expect(result.valid).toBe(true);
      expect(result.config).toBeDefined();
    });

    it('should reject invalid port', () => {
      const validator = new ConfigValidator({
        server: { port: 99999 }
      });
      
      const result = validator.validate();
      expect(result.valid).toBe(false);
    });

    it('should generate warnings for missing API key', () => {
      const validator = new ConfigValidator({});
      const result = validator.validate();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const health = await healthChecker.checkHealth();
      
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.checks).toBeDefined();
    });

    it('should have memory check', async () => {
      const health = await healthChecker.checkHealth();
      
      expect(health.checks.memory).toBeDefined();
      expect(health.checks.memory.healthy).toBe(true);
    });

    it('should export metrics in Prometheus format', () => {
      const metrics = healthChecker.getMetricsAsPrometheus();
      
      expect(metrics).toContain('process_start_time_seconds');
      expect(metrics).toContain('up');
    });
  });

  describe('Metrics System', () => {
    beforeEach(() => {
      healthChecker.resetMetrics();
    });

    it('should increment counters', () => {
      healthChecker.incrementCounter('test_counter', { label: 'value' });
      healthChecker.incrementCounter('test_counter', { label: 'value' });
      
      const metrics = healthChecker.getMetrics();
      const counter = metrics.find(m => m.name === 'test_counter');
      
      expect(counter).toBeDefined();
      expect(counter?.value).toBe(2);
    });

    it('should record gauges', () => {
      healthChecker.setGauge('test_gauge', 42);
      
      const metrics = healthChecker.getMetrics();
      const gauge = metrics.find(m => m.name === 'test_gauge');
      
      expect(gauge).toBeDefined();
      expect(gauge?.value).toBe(42);
    });

    it('should record histograms', () => {
      healthChecker.recordHistogram('test_histogram', 100);
      healthChecker.recordHistogram('test_histogram', 200);
      
      const metrics = healthChecker.getMetrics();
      const histogram = metrics.find(m => m.name === 'test_histogram');
      
      expect(histogram).toBeDefined();
      expect(histogram?.value).toBe(150);
    });
  });
});
