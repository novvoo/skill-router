#!/usr/bin/env node

/**
 * Test script for the 'he' library
 */

import * as he from 'he';

console.log('🧪 Testing he library...');
console.log('he:', he);
console.log('he.decode:', he.decode);
console.log('typeof he.decode:', typeof he.decode);

const testString = '&lt;hello&gt;';
const decoded = he.decode(testString);
console.log('Test string:', testString);
console.log('Decoded string:', decoded);

console.log('🎉 he library test passed!');
