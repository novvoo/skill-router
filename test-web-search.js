#!/usr/bin/env node

/**
 * Test script for web search functionality
 */

import { createAdapter } from './dist/tools/WebSearchTool/adapters/index.js';

async function testWebSearch() {
  console.log('🧪 Testing web search functionality...');
  
  try {
    const adapter = createAdapter();
    console.log('✅ Created search adapter');
    
    const results = await adapter.search('Skill-Router', {
      allowedDomains: [],
      blockedDomains: [],
      signal: null,
      onProgress: (progress) => {
        console.log('🔄 Progress:', progress);
      },
    });
    
    console.log('✅ Search completed successfully');
    console.log(`📊 Found ${results.length} results`);
    
    if (results.length > 0) {
      console.log('📋 First result:', results[0]);
    }
    
    console.log('🎉 Web search test passed!');
  } catch (error) {
    console.error('❌ Web search test failed:', error);
    process.exit(1);
  }
}

testWebSearch();
