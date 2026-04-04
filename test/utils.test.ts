// Tests for utility functions
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeString, sanitizeUrl, sanitizeNumber, sanitizeBoolean } from '../src/utils/validation.js';

describe('Validation utilities', () => {
  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      assert.strictEqual(sanitizeString('  hello  '), 'hello');
    });

    it('should return empty string for non-string inputs', () => {
      assert.strictEqual(sanitizeString(123), '');
      assert.strictEqual(sanitizeString(null), '');
      assert.strictEqual(sanitizeString(undefined), '');
    });

    it('should truncate to max length', () => {
      assert.strictEqual(sanitizeString('hello world', 5), 'hello');
    });
  });

  describe('sanitizeUrl', () => {
    it('should return valid http URLs', () => {
      assert.strictEqual(sanitizeUrl('http://example.com'), 'http://example.com/');
      assert.strictEqual(sanitizeUrl('https://example.com'), 'https://example.com/');
    });

    it('should return null for invalid URLs', () => {
      assert.strictEqual(sanitizeUrl('not a url'), null);
      assert.strictEqual(sanitizeUrl('ftp://example.com'), null);
      assert.strictEqual(sanitizeUrl(123), null);
    });
  });

  describe('sanitizeNumber', () => {
    it('should parse valid numbers', () => {
      assert.strictEqual(sanitizeNumber('123'), 123);
      assert.strictEqual(sanitizeNumber(123), 123);
    });

    it('should clamp to min/max', () => {
      assert.strictEqual(sanitizeNumber(5, 0, 10), 5);
      assert.strictEqual(sanitizeNumber(-5, 0, 10), 0);
      assert.strictEqual(sanitizeNumber(15, 0, 10), 10);
    });

    it('should return null for invalid numbers', () => {
      assert.strictEqual(sanitizeNumber('not a number'), null);
      assert.strictEqual(sanitizeNumber(null), null);
    });
  });

  describe('sanitizeBoolean', () => {
    it('should parse boolean values', () => {
      assert.strictEqual(sanitizeBoolean(true), true);
      assert.strictEqual(sanitizeBoolean(false), false);
    });

    it('should parse string values', () => {
      assert.strictEqual(sanitizeBoolean('true'), true);
      assert.strictEqual(sanitizeBoolean('TRUE'), true);
      assert.strictEqual(sanitizeBoolean('1'), true);
      assert.strictEqual(sanitizeBoolean('yes'), true);
      assert.strictEqual(sanitizeBoolean('false'), false);
      assert.strictEqual(sanitizeBoolean('0'), false);
    });

    it('should parse number values', () => {
      assert.strictEqual(sanitizeBoolean(1), true);
      assert.strictEqual(sanitizeBoolean(0), false);
    });

    it('should return false for invalid values', () => {
      assert.strictEqual(sanitizeBoolean(null), false);
      assert.strictEqual(sanitizeBoolean(undefined), false);
      assert.strictEqual(sanitizeBoolean('invalid'), false);
    });
  });
});
