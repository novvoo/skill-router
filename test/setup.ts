// Test setup file
import { logger } from '../src/utils/logger.js';

// Set log level to error for tests
logger.setLevel('error');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.HOST = '127.0.0.1';

console.log('Test environment setup complete');
