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

export interface SpawnOptions {
  description: string
  model?: string
  background?: boolean
  isolation?: 'none' | 'sandbox' | 'container'
  name?: string
  timeout?: number
  sessionId?: string
  onProgress?: (progress: AgentProgress) => void
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
      // 这里会调用实际的LLM API
      // 暂时返回模拟结果
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
    // 模拟LLM调用，在实际实现中这里会调用真正的LLM API
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 模拟工具使用
    const toolsUsed = this.definition.requiredTools?.length || 0
    const mockResponse = this.generateMockResponse()
    
    return {
      content: mockResponse,
      usage: {
        totalTokens: 150 + (toolsUsed * 50),
        toolUses: toolsUsed,
        durationMs: Date.now() - this.startTime
      }
    }
  }

  private generateMockResponse(): string {
    const taskType = this.definition.agentType
    const task = this.prompt
    
    switch (taskType) {
      case 'researcher':
        return `Research completed for: "${task}"\n\nKey findings:\n- Conducted web search for relevant information\n- Analyzed multiple sources\n- Compiled comprehensive report\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
      
      case 'coder':
        return `Coding task completed: "${task}"\n\nActions taken:\n- Analyzed existing codebase\n- Implemented requested features\n- Tested changes\n- Updated documentation\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
      
      default:
        return `Task completed: "${task}"\n\nThe ${this.definition.name} has successfully processed your request using available tools.\n\nTools used: ${this.definition.requiredTools?.join(', ') || 'none'}`
    }
  }

  abort(): void {
    this.abortController.abort()
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted
  }
}