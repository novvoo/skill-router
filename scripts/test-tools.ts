#!/usr/bin/env tsx

import { ToolExecutor } from '../src/tools/ToolExecutor.js'
import type { OpenAIConfig } from '../src/handler.js'

// Mock OpenAI config for testing
const config: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || 'test-key',
  baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
  embeddingModel: 'fast',
}

async function testTools() {
  console.log('🔧 Testing Skill Router Tools...\n')
  
  const executor = new ToolExecutor(config)
  
  // List available tools
  console.log('📋 Available Tools:')
  const tools = executor.getAvailableTools()
  tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.searchHint || 'No description'}`)
  })
  console.log()
  
  // Test tool schemas
  console.log('📝 Tool Schemas:')
  const schemas = executor.getToolSchemas()
  schemas.forEach(schema => {
    console.log(`  - ${schema.name}: ${schema.description}`)
  })
  console.log()
  
  // Test file read tool
  console.log('📖 Testing File Read Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-1',
      name: 'file_read',
      arguments: { path: 'package.json' }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      console.log(`  ✅ Success: Read ${(result.result as any)?.size || 0} bytes`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  // Test web fetch tool (will fail without internet, but tests the structure)
  console.log('🌐 Testing Web Fetch Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-2',
      name: 'web_fetch',
      arguments: { 
        url: 'https://httpbin.org/json',
        prompt: 'Extract the main information'
      }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      console.log(`  ✅ Success: Fetched ${(result.result as any)?.bytes || 0} bytes`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  // Test bash tool (simple command)
  console.log('💻 Testing Bash Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-3',
      name: 'bash',
      arguments: { command: 'echo "Hello from Skill Router Tools!"' }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      const output = result.result as any
      console.log(`  ✅ Success: Exit code ${output?.exitCode || 'unknown'}`)
      console.log(`  Output: ${output?.stdout || 'No output'}`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  // Test glob tool
  console.log('🔍 Testing Glob Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-4',
      name: 'glob',
      arguments: { pattern: '*.json', max_results: 5 }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      const output = result.result as any
      console.log(`  ✅ Success: Found ${output?.total_matches || 0} matches`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  // Test grep tool
  console.log('🔎 Testing Grep Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-5',
      name: 'grep',
      arguments: { pattern: 'skill-router', path: '.', max_results: 3 }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      const output = result.result as any
      console.log(`  ✅ Success: Found ${output?.total_matches || 0} matches in ${output?.files_searched || 0} files`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  // Test ask user question tool
  console.log('❓ Testing Ask User Question Tool...')
  try {
    const result = await executor.executeToolCall({
      id: 'test-6',
      name: 'ask_user_question',
      arguments: { 
        question: 'What is your favorite programming language?',
        options: ['JavaScript', 'TypeScript', 'Python', 'Other']
      }
    }, {
      abortController: new AbortController(),
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.message}`)
      }
    })
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`)
    } else {
      const output = result.result as any
      console.log(`  ✅ Success: User answered "${output?.answer || 'No answer'}"`)
    }
  } catch (error) {
    console.log(`  ❌ Exception: ${error}`)
  }
  console.log()
  
  console.log('🎉 Tool testing complete!')
}

// Run the test
testTools().catch(console.error)