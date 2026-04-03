import type { OpenAIConfig } from '../handler.js'
import { ToolExecutor, type ToolCall, type ToolCallResult, type ToolExecutionProgress } from './ToolExecutor.js'
import { getAllTools, findToolByName, type Tool, type ToolUseContext } from './index.js'

export type ToolExecutionStatus = 'queued' | 'executing' | 'completed' | 'yielded' | 'error'

export type StreamingToolExecutionProgress = ToolExecutionProgress & {
  status: ToolExecutionStatus
}

type ToolExecutionState = {
  toolCall: ToolCall
  status: ToolExecutionStatus
  startTime?: number
  result?: ToolCallResult
  promise?: Promise<ToolCallResult>
}

export class StreamingToolExecutor extends ToolExecutor {
  private executionQueue: Map<string, ToolExecutionState> = new Map()
  private onProgress?: (progress: StreamingToolExecutionProgress) => void
  private abortController?: AbortController
  
  constructor(config: OpenAIConfig) {
    super(config)
  }
  
  /**
   * Add tool calls to execution queue and start processing immediately
   */
  async executeToolCallsStreaming(
    toolCalls: ToolCall[],
    context: {
      sessionId?: string
      abortController: AbortController
      onProgress?: (progress: StreamingToolExecutionProgress) => void
    }
  ): Promise<ToolCallResult[]> {
    this.onProgress = context.onProgress
    this.abortController = context.abortController
    
    // Add all tools to queue with 'queued' status
    for (const toolCall of toolCalls) {
      this.executionQueue.set(toolCall.id, {
        toolCall,
        status: 'queued'
      })
      
      this.emitProgress({
        stage: 'tool_start',
        toolId: toolCall.id,
        toolName: toolCall.name,
        message: `Queued ${toolCall.name}`,
        status: 'queued'
      })
    }
    
    // Start processing queue immediately
    this.processQueue(context)
    
    // Wait for all tools to complete
    const results: ToolCallResult[] = []
    for (const [toolId, state] of this.executionQueue) {
      if (state.promise) {
        const result = await state.promise
        results.push(result)
        
        // Update status to yielded
        state.status = 'yielded'
        this.emitProgress({
          stage: 'tool_complete',
          toolId,
          toolName: state.toolCall.name,
          message: `Yielded result for ${state.toolCall.name}`,
          status: 'yielded',
          data: { result: result.result }
        })
      }
    }
    
    return results
  }
  
  /**
   * Process execution queue with concurrency control
   */
  private processQueue(context: {
    sessionId?: string
    abortController: AbortController
  }) {
    const executingStates = Array.from(this.executionQueue.values())
      .filter(state => state.status === 'executing')
    
    const queuedStates = Array.from(this.executionQueue.values())
      .filter(state => state.status === 'queued')
    
    for (const state of queuedStates) {
      if (this.canStartTool(state.toolCall, executingStates)) {
        // Start execution
        state.status = 'executing'
        state.startTime = Date.now()
        state.promise = this.executeToolCall(state.toolCall, context)
        
        this.emitProgress({
          stage: 'tool_start',
          toolId: state.toolCall.id,
          toolName: state.toolCall.name,
          message: `Starting ${state.toolCall.name}`,
          status: 'executing'
        })
        
        // Update executing states for next iteration
        executingStates.push(state)
      }
    }
  }
  
  /**
   * Check if a tool can start based on concurrency rules
   */
  private canStartTool(toolCall: ToolCall, executingStates: ToolExecutionState[]): boolean {
    const tool = this.getTool(toolCall.name)
    if (!tool) return false
    
    // If no tools are executing, any tool can start
    if (executingStates.length === 0) {
      return true
    }
    
    const isNewToolSafe = tool.isConcurrencySafe(toolCall.arguments)
    
    // Check if all executing tools are concurrency-safe
    const allExecutingAreSafe = executingStates.every(state => {
      const executingTool = this.getTool(state.toolCall.name)
      return executingTool?.isConcurrencySafe(state.toolCall.arguments) ?? false
    })
    
    // Allow parallel execution only if both new tool and all executing tools are safe
    return isNewToolSafe && allExecutingAreSafe
  }
  
  /**
   * Execute a single tool call with streaming progress
   */
  async executeToolCall(
    toolCall: ToolCall,
    context: {
      sessionId?: string
      abortController: AbortController
    }
  ): Promise<ToolCallResult> {
    const startTime = Date.now()
    const { id, name, arguments: args } = toolCall
    
    try {
      const tool = this.getTool(name)
      if (!tool) {
        throw new Error(`Tool not found: ${name}`)
      }
      
      // Create tool use context with streaming progress
      const toolContext: ToolUseContext = {
        abortController: context.abortController,
        sessionId: context.sessionId,
        config: (this as any).config, // Access inherited config
        onProgress: (event) => {
          this.emitProgress({
            stage: 'tool_progress',
            toolId: id,
            toolName: name,
            message: event.message,
            status: 'executing',
            data: event.data,
          })
        },
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
      
      // Execute the tool
      const result = await tool.call(args, toolContext, (progress) => {
        this.emitProgress({
          stage: 'tool_progress',
          toolId: id,
          toolName: name,
          message: progress.data?.query ? `Searching for ${progress.data.query}` : name,
          status: 'executing',
          data: progress.data,
        })
      })
      
      const duration = Date.now() - startTime
      const toolResult: ToolCallResult = {
        id,
        name,
        result: result.data,
        error: result.error,
        duration,
      }
      
      // Update state
      const state = this.executionQueue.get(id)
      if (state) {
        state.status = 'completed'
        state.result = toolResult
      }
      
      this.emitProgress({
        stage: 'tool_complete',
        toolId: id,
        toolName: name,
        message: `Completed ${name}`,
        status: 'completed',
        data: { duration, result: result.data },
      })
      
      // After completion, try to start more queued tools
      this.processQueue(context)
      
      return toolResult
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : String(error)
      
      const toolResult: ToolCallResult = {
        id,
        name,
        result: null,
        error: message,
        duration,
      }
      
      // Update state
      const state = this.executionQueue.get(id)
      if (state) {
        state.status = 'error'
        state.result = toolResult
      }
      
      this.emitProgress({
        stage: 'tool_error',
        toolId: id,
        toolName: name,
        message: `Error in ${name}: ${message}`,
        status: 'error',
      })
      
      // After error, try to start more queued tools
      this.processQueue(context)
      
      return toolResult
    }
  }
  
  /**
   * Emit progress event
   */
  private emitProgress(progress: StreamingToolExecutionProgress) {
    this.onProgress?.(progress)
  }
  
  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return super.getTool(name)
  }
  
  /**
   * Get available tools
   */
  getAvailableTools(): Tool[] {
    return super.getAvailableTools()
  }
  
  /**
   * Get tool schemas for LLM function calling
   */
  getToolSchemas(): Array<{
    name: string
    description: string
    parameters: any
  }> {
    return super.getToolSchemas()
  }
  
  /**
   * Get current execution status
   */
  getExecutionStatus(): Map<string, ToolExecutionStatus> {
    const status = new Map<string, ToolExecutionStatus>()
    for (const [toolId, state] of this.executionQueue) {
      status.set(toolId, state.status)
    }
    return status
  }
  
  /**
   * Clear completed executions from queue
   */
  clearCompleted() {
    for (const [toolId, state] of this.executionQueue) {
      if (state.status === 'yielded' || state.status === 'error') {
        this.executionQueue.delete(toolId)
      }
    }
  }
}