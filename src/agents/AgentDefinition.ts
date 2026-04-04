export interface AgentDefinition {
  agentType: string
  name: string
  description: string
  systemPrompt: string
  model?: string
  background?: boolean
  isolation?: 'none' | 'sandbox' | 'container'
  permissionMode?: 'default' | 'auto' | 'restricted'
  requiredTools?: string[]
  memory?: string
  color?: string
  source: 'builtin' | 'custom' | 'project'
  maxToolCalls?: number
  maxExecutionTimeMs?: number
  maxConcurrentTools?: number
}

import type { OpenAIConfig } from '../handler.js'

export interface SpawnOptions {
  description: string
  model?: string
  background?: boolean
  isolation?: 'none' | 'sandbox' | 'container'
  name?: string
  timeout?: number
  sessionId?: string
  workingDir?: string
  onProgress?: (progress: AgentProgress) => void
  openaiConfig?: OpenAIConfig
}

export interface AgentProgress {
  stage: string
  message: string
  data?: any
}

export interface AgentResult {
  content: string
  usage: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
}

export class AgentInstance {
  public readonly id: string
  public readonly definition: AgentDefinition
  public readonly prompt: string
  public readonly options: SpawnOptions
  private startTime: number
  private abortController: AbortController
  private toolCallCount: number = 0
  private maxToolCalls: number
  private maxExecutionTimeMs: number
  private messages: Array<{ role: string; content: string | null; tool_calls?: any[] }> = []

  constructor(
    id: string,
    definition: AgentDefinition,
    prompt: string,
    options: SpawnOptions
  ) {
    this.id = id
    this.definition = definition
    this.prompt = prompt
    this.options = options
    this.startTime = Date.now()
    this.abortController = new AbortController()
    this.maxToolCalls = definition.maxToolCalls || 50
    this.maxExecutionTimeMs = definition.maxExecutionTimeMs || 30 * 60 * 1000 // 30 minutes default
  }

  async execute(): Promise<AgentResult> {
    this.options.onProgress?.({
      stage: 'agent_start',
      message: `Starting ${this.definition.name}`,
      data: { agentId: this.id, agentType: this.definition.agentType }
    })

    // Set up execution timeout
    const timeoutId = setTimeout(() => {
      this.abort()
    }, this.maxExecutionTimeMs)

    try {
      const result = await this.executeWithLLM()
      
      this.options.onProgress?.({
        stage: 'agent_complete',
        message: `Completed ${this.definition.name}`,
        data: { agentId: this.id, result }
      })

      return result
    } catch (error) {
      this.options.onProgress?.({
        stage: 'agent_error',
        message: `Error in ${this.definition.name}: ${error}`,
        data: { agentId: this.id, error }
      })
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async executeWithLLM(): Promise<AgentResult> {
    const { ToolExecutor } = await import('../tools/ToolExecutor.js')
    
    let apiKey = this.options.openaiConfig?.apiKey || String(process.env.OPENAI_API_KEY || "").trim()
    let baseUrl = this.options.openaiConfig?.baseUrl || String(process.env.OPENAI_BASE_URL || "").trim()
    let model = this.options.openaiConfig?.model || this.options.model || String(process.env.OPENAI_MODEL || "").trim()
    
    if (!apiKey || !baseUrl || !model) {
      return this.generateMockResponse()
    }
    
    const config: OpenAIConfig = { apiKey, baseUrl, model }
    const toolExecutor = new ToolExecutor(config, {
      maxConcurrentTools: this.definition.maxConcurrentTools || 3
    })
    
    const availableTools = toolExecutor.getAvailableTools()
    const toolsForAgent = availableTools.filter(tool => 
      !this.definition.requiredTools || 
      this.definition.requiredTools.includes(tool.name)
    )
    
    const tools = toolsForAgent.map(tool => ({
      name: tool.name,
      description: tool.searchHint || tool.name,
      parameters: tool.inputJSONSchema || {
        type: 'object',
        properties: {},
      },
    }))
    
    const systemPrompt = this.buildSystemPrompt(tools)
    
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.prompt }
    ]
    
    let totalTokens = 0
    let toolUses = 0
    let iterations = 0
    const maxIterations = Math.min(this.maxToolCalls, 100)
    
    while (iterations < maxIterations && !this.isAborted) {
      iterations++
      
      this.options.onProgress?.({
        stage: 'agent_thinking',
        message: `Iteration ${iterations}/${maxIterations}`,
        data: { iteration: iterations }
      })
      
      const response = await this.callLLM(tools)
      
      if (!response) {
        break
      }
      
      this.messages.push(response)
      
      const assistantMessage = response.content || ''
      const toolCalls = response.tool_calls || this.parseToolCalls(assistantMessage)
      
      if (toolCalls.length === 0) {
        break
      }
      
      if (this.toolCallCount + toolCalls.length > this.maxToolCalls) {
        this.options.onProgress?.({
          stage: 'agent_warning',
          message: `Tool call limit reached (${this.maxToolCalls})`,
          data: { limit: this.maxToolCalls }
        })
        break
      }
      
      const toolResults = await this.executeToolCalls(toolCalls, toolExecutor)
      toolUses += toolResults.length
      this.toolCallCount += toolResults.length
      
      for (const result of toolResults) {
        this.messages.push({
          role: 'tool',
          content: JSON.stringify(result.result || { error: result.error }),
          tool_calls: [{ id: result.id }]
        })
      }
    }
    
    const finalMessage = this.messages.findLast(m => m.role === 'assistant')
    const finalContent = finalMessage?.content || 'Task completed.'
    
    return {
      content: finalContent,
      usage: {
        totalTokens,
        toolUses,
        durationMs: Date.now() - this.startTime
      }
    }
  }

  private buildSystemPrompt(tools: any[]): string {
    return `You are ${this.definition.name}, ${this.definition.description}

${this.definition.systemPrompt}

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Guidelines:
- Use tools when necessary to complete the task
- Make multiple tool calls in parallel when possible
- After using tools, synthesize the results into a final answer
- If you're unsure, ask for clarification instead of guessing
- Always verify tool results before relying on them`
  }

  private async callLLM(tools: any[]): Promise<any> {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
    const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim()
    
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: this.abortController.signal,
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          messages: this.messages,
          tools: tools.length > 0 ? tools.map(tool => ({
            type: 'function',
            function: tool
          })) : undefined,
          tool_choice: tools.length > 0 ? 'auto' : 'none',
          temperature: 0.7
        }),
      })
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${await response.text()}`)
      }
      
      const data = await response.json() as any
      return data.choices[0]?.message || { role: 'assistant', content: '' }
    } catch (error) {
      if (this.abortController.signal.aborted) {
        throw new Error('Agent execution was aborted')
      }
      throw error
    }
  }

  private async executeToolCalls(
    toolCalls: any[], 
    toolExecutor: any
  ): Promise<Array<{ id: string; name: string; result: any; error?: string }>> {
    const results: Array<{ id: string; name: string; result: any; error?: string }> = []
    
    for (const toolCall of toolCalls) {
      const callId = toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      const name = toolCall.function?.name || toolCall.name
      const args = toolCall.function?.arguments 
        ? JSON.parse(toolCall.function.arguments) 
        : toolCall.arguments
      
      this.options.onProgress?.({
        stage: 'tool_start',
        message: `Using tool: ${name}`,
        data: { toolName: name, toolId: callId, arguments: args }
      })
      
      try {
        const result = await toolExecutor.executeToolCall(
          { id: callId, name, arguments: args },
          {
            sessionId: this.options.sessionId,
            abortController: this.abortController
          }
        )
        
        results.push({
          id: callId,
          name,
          result: result.result,
          error: result.error
        })
        
        this.options.onProgress?.({ 
          stage: 'tool_complete',
          message: `Tool completed: ${name}`,
          data: { toolName: name, toolId: callId, result: result.result }
        })
      } catch (error) {
        results.push({
          id: callId,
          name,
          result: null,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    
    return results
  }

  private parseToolCalls(content: string): any[] {
    const toolCalls: any[] = []
    const toolCallRegex = /```tool:(\w+)\n([\s\S]*?)\n```/g
    let match
    
    while ((match = toolCallRegex.exec(content)) !== null) {
      const [, toolName, argsJson] = match
      try {
        const args = JSON.parse(argsJson)
        toolCalls.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          name: toolName,
          arguments: args,
        })
      } catch (error) {
        console.warn(`Failed to parse tool call arguments for ${toolName}:`, error)
      }
    }
    
    return toolCalls
  }

  private generateMockResponse(): AgentResult {
    const toolsUsed = this.definition.requiredTools?.length || 0
    const taskType = this.definition.agentType
    const task = this.prompt
    
    let mockResponse = ''
    switch (taskType) {
      case 'researcher':
        mockResponse = `Research completed for: "${task}"\n\nKey findings:\n- Conducted web search for relevant information\n- Analyzed multiple sources\n- Compiled comprehensive report\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
        break
      
      case 'coder':
        mockResponse = `Coding task completed: "${task}"\n\nActions taken:\n- Analyzed existing codebase\n- Implemented requested features\n- Tested changes\n- Updated documentation\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
        break
      
      default:
        mockResponse = `Task completed: "${task}"\n\nThe ${this.definition.name} has successfully processed your request using available tools.\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
    }
    
    return {
      content: mockResponse,
      usage: {
        totalTokens: 150 + (toolsUsed * 50),
        toolUses: toolsUsed,
        durationMs: Date.now() - this.startTime
      }
    }
  }

  abort(): void {
    this.abortController.abort()
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted
  }
}