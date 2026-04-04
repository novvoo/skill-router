// Tests for logger
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Logger } from '../src/utils/logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: 'debug', outputToConsole: false });
  });

  it('should create logger with default settings', () => {
    const defaultLogger = new Logger({ outputToConsole: false });
    assert.ok(defaultLogger);
  });

  it('should log messages at different levels', () => {
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    const entries = logger.getEntries();
    assert.strictEqual(entries.length, 4);
  });

  it('should filter logs by level', () => {
    logger.setLevel('warn');
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    const entries = logger.getEntries();
    assert.strictEqual(entries.length, 2);
  });

  it('should include metadata in logs', () => {
    logger.info('test', { key: 'value' });
    const entries = logger.getEntries();
    assert.ok(entries[0].metadata);
  });

  it('should clear logs', () => {
    logger.info('test');
    logger.clear();
    const entries = logger.getEntries();
    assert.strictEqual(entries.length, 0);
  });

  it('should limit log entries', () => {
    const limitedLogger = new Logger({ level: 'debug', outputToConsole: false, maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      limitedLogger.info(`message ${i}`);
    }
    const entries = limitedLogger.getEntries();
    assert.strictEqual(entries.length, 3);
  });
});
