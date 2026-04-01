import type { OpenAIConfig } from '../handler.js'
import { getAllTools, findToolByName, type Tool, type ToolUseContext } from './index.js'

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolCallResult = {
  id: string
  name: string
  result: unknown
  error?: string
  duration: number
}

export type ToolExecutionProgress = {
  stage: 'tool_start' | 'tool_progress' | 'tool_complete' | 'tool_error'
  toolId: string
  toolName: string
  message: string
  data?: any
}

export class ToolExecutor {
  private tools: Tool[]
  private config: OpenAIConfig
  
  constructor(config: OpenAIConfig) {
    this.config = config
    this.tools = [...getAllTools()]
  }
  
  /**
   * Get available tools
   */
  getAvailableTools(): Tool[] {
    return this.tools.filter(tool => tool.isEnabled())
  }
  
  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return findToolByName(this.tools, name)
  }
  
  /**
   * Execute a single tool call
   */
  async executeToolCall(
    toolCall: ToolCall,
    context: {
      sessionId?: string
      abortController: AbortController
      onProgress?: (progress: ToolExecutionProgress) => void
    }
  ): Promise<ToolCallResult> {
    const startTime = Date.now()
    const { id, name, arguments: args } = toolCall
    
    context.onProgress?.({
      stage: 'tool_start',
      toolId: id,
      toolName: name,
      message: `Starting ${name}`,
    })
    
    try {
      const tool = this.getTool(name)
      if (!tool) {
        throw new Error(`Tool not found: ${name}`)
      }
      
      // Create tool use context
      const toolContext: ToolUseContext = {
        abortController: context.abortController,
        sessionId: context.sessionId,
        config: this.config,
        onProgress: context.onProgress ? (event) => {
          context.onProgress!({
            stage: 'tool_progress',
            toolId: id,
            toolName: name,
            message: event.message,
            data: event.data,
          })
        } : undefined,
      }
      
      // Validate input
      if (tool.validateInput) {
        const validation = await tool.validateInput(args, toolContext)
        if (!validation.result) {
          throw new Error(validation.message)
        }
      }
      
      // Check permissions
      const permission = await tool.checkPermissions(args, toolContext)
      if (permission.behavior === 'deny') {
        throw new Error(permission.message)
      }
      
      if (permission.behavior === 'ask') {
        // In a real implementation, this would prompt the user
        // For now, we'll allow the operation
        console.warn(`Permission required for ${name}: ${permission.message}`)
      }
      
      // Execute the tool
      const result = await tool.call(
        args,
        toolContext,
        context.onProgress ? (progress) => {
          context.onProgress!({
            stage: 'tool_progress',
            toolId: id,
            toolName: name,
            message: `${name} progress`,
            data: progress.data,
          })
        } : undefined
      )
      
      const duration = Date.now() - startTime
      
      context.onProgress?.({
        stage: 'tool_complete',
        toolId: id,
        toolName: name,
        message: `Completed ${name}`,
        data: { duration },
      })
      
      return {
        id,
        name,
        result: result.data,
        error: result.error,
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : String(error)
      
      context.onProgress?.({
        stage: 'tool_error',
        toolId: id,
        toolName: name,
        message: `Error in ${name}: ${message}`,
      })
      
      return {
        id,
        name,
        result: null,
        error: message,
        duration,
      }
    }
  }
  
  /**
   * Execute multiple tool calls in parallel
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context: {
      sessionId?: string
      abortController: AbortController
      onProgress?: (progress: ToolExecutionProgress) => void
    }
  ): Promise<ToolCallResult[]> {
    const promises = toolCalls.map(toolCall =>
      this.executeToolCall(toolCall, context)
    )
    
    return Promise.all(promises)
  }
  
  /**
   * Get tool schemas for LLM function calling
   */
  getToolSchemas(): Array<{
    name: string
    description: string
    parameters: any
  }> {
    return this.getAvailableTools().map(tool => ({
      name: tool.name,
      description: `${tool.searchHint || tool.name}`,
      parameters: tool.inputJSONSchema || {
        type: 'object',
        properties: {},
      },
    }))
  }
  
  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = []
    
    // Look for tool call patterns in the content
    // This is a simple implementation - in practice, you'd use the LLM's function calling format
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
  
  /**
   * Format tool results for LLM context
   */
  formatToolResults(results: ToolCallResult[]): string {
    if (results.length === 0) {
      return ''
    }
    
    const sections = results.map(result => {
      const header = `## Tool: ${result.name} (${result.duration}ms)`
      
      if (result.error) {
        return `${header}\n**Error:** ${result.error}`
      }
      
      const resultStr = typeof result.result === 'string' 
        ? result.result 
        : JSON.stringify(result.result, null, 2)
      
      return `${header}\n**Result:**\n${resultStr}`
    })
    
    return `# Tool Execution Results\n\n${sections.join('\n\n')}`
  }
}