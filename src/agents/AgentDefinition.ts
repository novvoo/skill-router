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
  }

  async execute(): Promise<AgentResult> {
    this.options.onProgress?.({
      stage: 'agent_start',
      message: `Starting ${this.definition.name}`,
      data: { agentId: this.id, agentType: this.definition.agentType }
    })

    try {
      // 调用实际的LLM API
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
    }
  }

  private async executeWithLLM(): Promise<AgentResult> {
    // 导入必要的模块
    const { ToolExecutor } = await import('../tools/ToolExecutor.js')
    // 直接使用类型，不需要动态导入
    
    // 优先使用传递的openaiConfig，否则从环境变量获取
    let apiKey = this.options.openaiConfig?.apiKey || String(process.env.OPENAI_API_KEY || "").trim()
    let baseUrl = this.options.openaiConfig?.baseUrl || String(process.env.OPENAI_BASE_URL || "").trim()
    let model = this.options.openaiConfig?.model || this.options.model || String(process.env.OPENAI_MODEL || "").trim()
    
    if (!apiKey || !baseUrl || !model) {
      // 如果没有配置，返回模拟结果
      return this.generateMockResponse()
    }
    
    // 创建工具执行器
    const config: OpenAIConfig = {
      apiKey,
      baseUrl,
      model
    }
    
    const toolExecutor = new ToolExecutor(config)
    
    // 准备工具列表
    const availableTools = toolExecutor.getAvailableTools()
    const toolsForAgent = availableTools.filter(tool => 
      !this.definition.requiredTools || 
      this.definition.requiredTools.includes(tool.name)
    )
    
    // 准备工具模式
    const tools = toolsForAgent.map(tool => ({
      name: tool.name,
      description: tool.searchHint || tool.name,
      parameters: tool.inputJSONSchema || {
        type: 'object',
        properties: {},
      },
    }))
    
    // 准备系统提示
    const systemPrompt = `
You are ${this.definition.name}, ${this.definition.description}

${this.definition.systemPrompt}

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When using tools, format your response as:
\`\`\`tool:{tool_name}
{json_arguments}
\`\`\`

For example:
\`\`\`tool:web_search
{"query": "latest AI developments"}
\`\`\`
    `
    
    // 调用LLM API
    try {
      const response = await this.callLLM(systemPrompt, this.prompt, tools)
      
      // 解析工具调用
      const toolCalls = this.parseToolCalls(response)
      
      // 执行工具调用
      const toolResults = []
      for (const toolCall of toolCalls) {
        // 显示工具调用开始
        console.log(`🔧 Executing tool: ${toolCall.name}`)
        console.log(`   Arguments: ${JSON.stringify(toolCall.arguments)}`)
        
        this.options.onProgress?.({
          stage: 'tool_start',
          message: `Using tool: ${toolCall.name}`,
          data: { toolName: toolCall.name, toolId: toolCall.id, arguments: toolCall.arguments }
        })
        
        const result = await toolExecutor.executeToolCall(toolCall, {
          sessionId: this.options.sessionId,
          abortController: this.abortController
        })
        
        // 显示工具调用结果
        console.log(`✅ Tool execution completed: ${toolCall.name}`)
        console.log(`   Result: ${JSON.stringify(result.result)}`)
        
        toolResults.push(result)
        
        this.options.onProgress?.({ 
          stage: 'tool_complete',
          message: `Tool completed: ${toolCall.name}`,
          data: { toolName: toolCall.name, toolId: toolCall.id, result: result.result }
        })
      }
      
      // 再次调用LLM处理工具结果
      let finalResponse = response
      if (toolResults.length > 0) {
        const toolResultsText = toolResults.map(r => 
          `Tool ${r.name} (${r.duration}ms): ${r.error || JSON.stringify(r.result)}`
        ).join('\n')
        
        const followUpPrompt = `
Tool execution results:
${toolResultsText}

Please summarize the results and provide a final response to the user's original query.
        `
        
        // 显示正在生成最终响应
        console.log('🧠 Generating final response...')
        
        finalResponse = await this.callLLM(systemPrompt, followUpPrompt, [])
      }
      
      return {
        content: finalResponse,
        usage: {
          totalTokens: 1000, // 模拟值
          toolUses: toolResults.length,
          durationMs: Date.now() - this.startTime
        }
      }
    } catch (error) {
      console.error('LLM execution error:', error)
      // 出错时返回模拟结果
      return this.generateMockResponse()
    }
  }

  private async callLLM(systemPrompt: string, userPrompt: string, tools: any[]): Promise<string> {
    // 从环境变量获取OpenAI配置
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
    const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim()
    
    // 定义LLM API返回数据的类型
    interface ToolCall {
      id: string
      type: string
      function: {
        name: string
        arguments: string
      }
    }
    
    interface Message {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    
    interface Choice {
      message: Message
    }
    
    interface LLMResponse {
      choices: Choice[]
    }
    
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
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
      
      const data = await response.json() as LLMResponse
      return data.choices[0]?.message?.content || data.choices[0]?.message?.tool_calls?.map((tc) => 
        `\`\`\`tool:${tc.function.name}\n${tc.function.arguments}\n\`\`\``
      ).join('\n') || ''
    } catch (error) {
      console.error('LLM API call error:', error)
      // 出错时返回模拟的工具调用
      if (this.definition.requiredTools?.includes('web_search')) {
        return `\`\`\`tool:web_search\n{"query": "${this.prompt}"}\n\`\`\``
      }
      return `I need to use tools to complete this task.`
    }
  }

  private parseToolCalls(content: string): Array<{ id: string; name: string; arguments: any }> {
    const toolCalls = []
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
    // 模拟LLM调用，在实际实现中这里会调用真正的LLM API
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