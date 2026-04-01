import { z } from 'zod'
import { buildTool } from '../tools/Tool.js'
import { AgentManager } from './AgentManager.js'

const inputSchema = z.object({
  prompt: z.string().describe('Task for the agent to perform'),
  agent_type: z.string().optional().describe('Type of specialized agent'),
  description: z.string().describe('Short description of the task'),
  model: z.string().optional().describe('Model override for this agent'),
  background: z.boolean().default(false).describe('Run agent in background'),
  isolation: z.enum(['none', 'sandbox', 'container']).optional(),
  name: z.string().optional().describe('Name for agent (enables messaging)'),
  timeout: z.number().int().min(1).max(3600).default(300).describe('Timeout in seconds'),
})

const outputSchema = z.object({
  status: z.enum(['completed', 'background', 'error']),
  agentId: z.string(),
  description: z.string(),
  result: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  usage: z.object({
    totalTokens: z.number(),
    toolUses: z.number(),
    durationMs: z.number(),
  }).optional(),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>

export type AgentProgress = {
  type: 'agent_start' | 'agent_progress' | 'agent_complete' | 'agent_error'
  agentId?: string
  agent_type?: string
  description?: string
  result?: any
  error?: any
}

export const AgentTool = buildTool({
  name: 'agent',
  searchHint: 'spawn and manage AI agents for complex tasks',
  maxResultSizeChars: 50_000,
  
  async description(input) {
    return `Spawn agent: ${input.description}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return true
  },
  
  isReadOnly() {
    return false
  },
  
  userFacingName() {
    return 'Agent'
  },
  
  getToolUseSummary(input) {
    return input?.description || input?.agent_type || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Spawning agent: ${summary}` : 'Spawning agent'
  },
  
  async checkPermissions(input) {
    // 检查是否允许生成agent
    if (input.background) {
      return {
        behavior: 'ask',
        message: `Allow spawning background agent: ${input.description}?`,
        suggestions: [
          {
            type: 'allow_once',
            label: 'Allow once',
          },
          {
            type: 'allow_background_agents',
            label: 'Allow background agents',
          },
        ],
      }
    }
    
    return {
      behavior: 'allow',
      updatedInput: input,
    }
  },
  
  async validateInput(input) {
    const { prompt, description, timeout } = input
    
    if (!prompt.trim()) {
      return {
        result: false,
        message: 'Agent prompt cannot be empty',
        errorCode: 1,
      }
    }
    
    if (!description.trim()) {
      return {
        result: false,
        message: 'Agent description cannot be empty',
        errorCode: 2,
      }
    }
    
    if (timeout && (timeout < 1 || timeout > 3600)) {
      return {
        result: false,
        message: 'Timeout must be between 1 and 3600 seconds',
        errorCode: 3,
      }
    }
    
    return { result: true }
  },
  
  async call({ 
    prompt, 
    agent_type, 
    description, 
    model, 
    background, 
    isolation, 
    name, 
    timeout 
  }, context, onProgress) {
    const agentManager = AgentManager.getInstance()
    
    onProgress?.({
      toolUseID: 'agent-spawn',
      data: {
        type: 'agent_start',
        description,
        agent_type: agent_type || 'general',
      },
    })
    
    try {
      const instance = await agentManager.spawnAgent(
        agent_type || 'general',
        prompt,
        {
          description,
          model,
          background,
          isolation,
          name,
          timeout,
          sessionId: context.sessionId,
          onProgress: (progress) => {
            onProgress?.({
              toolUseID: 'agent-progress',
              data: {
                type: 'agent_progress',
                agentId: instance.id,
                ...progress,
              },
            })
          },
        }
      )
      
      if (background) {
        const output: AgentOutput = {
          status: 'background',
          agentId: instance.id,
          description,
          message: 'Agent started in background. You will be notified when complete.',
        }
        return { data: output }
      } else {
        const result = await instance.execute()
        const output: AgentOutput = {
          status: 'completed',
          agentId: instance.id,
          description,
          result: result.content,
          usage: result.usage,
        }
        return { data: output }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const output: AgentOutput = {
        status: 'error',
        agentId: 'unknown',
        description,
        error: message,
      }
      return { data: output, error: message }
    }
  },
})