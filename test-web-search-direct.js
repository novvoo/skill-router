#!/usr/bin/env node

/**
 * Test script for direct web search tool call
 */

import { WebSearchTool } from './dist/tools/WebSearchTool.js';

async function testWebSearchDirect() {
  console.log('🧪 Testing direct web search tool call...');
  
  try {
    // Create a mock context
    const context = {
      abortController: new AbortController(),
      sessionId: 'test-session',
      config: {
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        baseUrl: process.env.OPENAI_BASE_URL || 'http://localhost:8080',
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
      }
    };
    
    // Call the web search tool directly with the user's exact query
    const result = await WebSearchTool.call(
      { query: '上海今天的温度怎么样' },
      context,
      (progress) => {
        console.log('🔄 Progress:', progress.data);
      }
    );
    
    console.log('✅ Web search tool call completed successfully');
    console.log('📊 Result:', JSON.stringify(result.data, null, 2));
    
    console.log('🎉 Direct web search test passed!');
  } catch (error) {
    console.error('❌ Direct web search test failed:', error);
    process.exit(1);
  }
}

testWebSearchDirect();
