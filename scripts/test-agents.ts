#!/usr/bin/env tsx

import { AgentManager } from '../src/agents/AgentManager.js'

async function testAgentSystem() {
  console.log('🧪 Testing Agent System...\n')

  try {
    // Initialize agent manager
    const agentManager = AgentManager.getInstance()
    
    // Load agents
    console.log('📦 Loading agents...')
    await agentManager.loadAgents('./agent/agents')
    
    const availableAgents = agentManager.getAvailableAgents()
    console.log(`✅ Loaded ${availableAgents.length} agents:`)
    
    availableAgents.forEach(agent => {
      console.log(`   - ${agent.agentType}: ${agent.name}`)
    })
    
    console.log('\n🚀 Testing agent spawn...')
    
    // Test spawning a general agent
    const instance = await agentManager.spawnAgent('general', 'Hello, this is a test task', {
      description: 'Test task',
      background: false,
      onProgress: (progress) => {
        console.log(`   Progress: ${progress.message}`)
      }
    })
    
    console.log(`✅ Agent spawned: ${instance.id}`)
    
    // Execute the agent
    const result = await instance.execute()
    console.log(`✅ Agent completed:`)
    console.log(`   Content: ${result.content}`)
    console.log(`   Tokens: ${result.usage.totalTokens}`)
    console.log(`   Duration: ${result.usage.durationMs}ms`)
    
    console.log('\n🎉 Agent system test completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
testAgentSystem().catch(console.error)