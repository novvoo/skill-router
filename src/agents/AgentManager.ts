import { readdir, readFile } from 'fs/promises'
import { join, extname } from 'path'
import { AgentDefinition, AgentInstance, SpawnOptions } from './AgentDefinition.js'

export class AgentManager {
  private static instance: AgentManager
  private agents = new Map<string, AgentDefinition>()
  private runningAgents = new Map<string, AgentInstance>()
  private completionCallbacks = new Map<string, (result: any) => void>()
  private errorCallbacks = new Map<string, (error: any) => void>()

  private constructor() {}

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager()
    }
    return AgentManager.instance
  }

  async loadAgents(agentsDir: string): Promise<void> {
    try {
      // Load from agents directory if it exists
      const agentFiles = await this.scanAgentFiles(agentsDir)
      
      for (const file of agentFiles) {
        try {
          const agent = await this.parseAgentDefinition(file)
          this.agents.set(agent.agentType, agent)
          console.log(`✅ Loaded agent: ${agent.agentType}`)
        } catch (error) {
          console.warn(`⚠️  Failed to load agent from ${file}:`, error)
        }
      }
      
      // Load built-in agents if no custom agents found
      if (this.agents.size === 0) {
        this.loadBuiltinAgents()
      }
      
      console.log(`📦 Loaded ${this.agents.size} agents`)
    } catch (error) {
      console.warn(`⚠️  Failed to load agents from ${agentsDir}:`, error)
      // Fallback to built-in agents
      this.loadBuiltinAgents()
    }
  }

  private loadBuiltinAgents(): void {
    const builtinAgents: AgentDefinition[] = [
      {
        agentType: 'general',
        name: 'General Assistant',
        description: 'A versatile AI assistant for various tasks',
        systemPrompt: 'You are a helpful AI assistant with access to various tools. Use them appropriately to complete tasks effectively.',
        background: false,
        requiredTools: ['file_read', 'file_write', 'web_search', 'bash'],
        color: '#1976d2',
        source: 'builtin',
        maxToolCalls: 50,
        maxExecutionTimeMs: 30 * 60 * 1000, // 30 minutes
        maxConcurrentTools: 3
      },
      {
        agentType: 'researcher',
        name: 'Research Assistant',
        description: 'Specialized in research and information gathering',
        systemPrompt: 'You are a research specialist. Conduct thorough research, gather information from multiple sources, and provide comprehensive analysis.',
        background: true,
        requiredTools: ['web_search', 'web_fetch', 'file_write', 'file_read'],
        color: '#2e7d32',
        source: 'builtin',
        maxToolCalls: 100,
        maxExecutionTimeMs: 60 * 60 * 1000, // 60 minutes
        maxConcurrentTools: 5
      },
      {
        agentType: 'coder',
        name: 'Coding Assistant',
        description: 'Specialized in software development and programming',
        systemPrompt: 'You are a software development specialist. Write clean, maintainable code and follow best practices.',
        background: false,
        isolation: 'sandbox',
        permissionMode: 'auto',
        requiredTools: ['file_read', 'file_write', 'file_edit', 'bash', 'grep', 'glob'],
        color: '#ff9800',
        source: 'builtin',
        maxToolCalls: 200,
        maxExecutionTimeMs: 60 * 60 * 1000, // 60 minutes
        maxConcurrentTools: 5
      }
    ]

    builtinAgents.forEach(agent => {
      this.agents.set(agent.agentType, agent)
    })
  }

  private async scanAgentFiles(agentsDir: string): Promise<string[]> {
    const files: string[] = []
    
    try {
      const entries = await readdir(agentsDir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(agentsDir, entry.name)
        
        if (entry.isFile() && extname(entry.name) === '.md') {
          files.push(fullPath)
        } else if (entry.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.scanAgentFiles(fullPath)
          files.push(...subFiles)
        }
      }
    } catch (error) {
      // 目录不存在或无法访问，返回空数组
    }
    
    return files
  }

  private async parseAgentDefinition(filePath: string): Promise<AgentDefinition> {
    const content = await readFile(filePath, 'utf-8')
    
    // 解析Markdown格式的agent定义
    const lines = content.split('\n')
    let agentType = ''
    let name = ''
    let description = ''
    let systemPrompt = ''
    let model: string | undefined
    let background = false
    let isolation: 'none' | 'sandbox' | 'container' = 'none'
    let permissionMode: 'default' | 'auto' | 'restricted' = 'default'
    let requiredTools: string[] = []
    let memory: string | undefined
    let color: string | undefined
    
    let inSystemPrompt = false
    let inConfig = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // 解析标题作为name
      if (line.startsWith('# ') && !name) {
        name = line.substring(2).trim()
        agentType = name.toLowerCase().replace(/\s+/g, '_')
      }
      
      // 解析描述
      if (line && !line.startsWith('#') && !description && name) {
        description = line
      }
      
      // 解析配置块
      if (line === '```yaml' || line === '```yml') {
        inConfig = true
        continue
      }
      
      if (inConfig && line === '```') {
        inConfig = false
        continue
      }
      
      if (inConfig) {
        const [key, ...valueParts] = line.split(':')
        const value = valueParts.join(':').trim()
        
        switch (key.trim()) {
          case 'agentType':
            agentType = value
            break
          case 'name':
            name = value
            break
          case 'model':
            model = value
            break
          case 'background':
            background = value === 'true'
            break
          case 'isolation':
            isolation = value as 'none' | 'sandbox' | 'container'
            break
          case 'permissionMode':
            permissionMode = value as 'default' | 'auto' | 'restricted'
            break
          case 'requiredTools':
            requiredTools = value.split(',').map(t => t.trim())
            break
          case 'memory':
            memory = value
            break
          case 'color':
            color = value
            break
        }
      }
      
      // 解析系统提示词
      if (line === '## System Prompt' || line === '## 系统提示') {
        inSystemPrompt = true
        continue
      }
      
      if (inSystemPrompt && line.startsWith('## ')) {
        inSystemPrompt = false
      }
      
      if (inSystemPrompt && line) {
        systemPrompt += line + '\n'
      }
    }
    
    if (!agentType || !name) {
      throw new Error(`Invalid agent definition in ${filePath}: missing agentType or name`)
    }
    
    return {
      agentType,
      name,
      description: description || name,
      systemPrompt: systemPrompt.trim() || `You are ${name}, a helpful AI assistant.`,
      model,
      background,
      isolation,
      permissionMode,
      requiredTools: requiredTools.length > 0 ? requiredTools : undefined,
      memory,
      color,
      source: 'project'
    }
  }

  async spawnAgent(
    agentType: string,
    prompt: string,
    options: SpawnOptions
  ): Promise<AgentInstance> {
    const definition = this.agents.get(agentType)
    if (!definition) {
      throw new Error(`Agent type not found: ${agentType}`)
    }

    const agentId = this.generateAgentId()
    const instance = new AgentInstance(agentId, definition, prompt, options)

    this.runningAgents.set(agentId, instance)

    // 总是异步运行agent，这样进度回调才会被触发
    void this.runAgentAsync(instance)

    return instance
  }

  private async runAgentAsync(instance: AgentInstance): Promise<void> {
    try {
      const result = await instance.execute()
      this.notifyAgentComplete(instance, result)
    } catch (error) {
      this.notifyAgentError(instance, error)
    } finally {
      this.runningAgents.delete(instance.id)
    }
  }

  private notifyAgentComplete(instance: AgentInstance, result: any): void {
    const callback = this.completionCallbacks.get(instance.id)
    if (callback) {
      callback(result)
      this.completionCallbacks.delete(instance.id)
    }
  }

  private notifyAgentError(instance: AgentInstance, error: any): void {
    const callback = this.errorCallbacks.get(instance.id)
    if (callback) {
      callback(error)
      this.errorCallbacks.delete(instance.id)
    }
  }

  onAgentComplete(agentId: string, callback: (result: any) => void): void {
    this.completionCallbacks.set(agentId, callback)
  }

  onAgentError(agentId: string, callback: (error: any) => void): void {
    this.errorCallbacks.set(agentId, callback)
  }

  getAvailableAgents(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  getRunningAgents(): AgentInstance[] {
    return Array.from(this.runningAgents.values())
  }

  getAgent(agentType: string): AgentDefinition | undefined {
    return this.agents.get(agentType)
  }

  killAgent(agentId: string): boolean {
    const instance = this.runningAgents.get(agentId)
    if (instance) {
      instance.abort()
      this.runningAgents.delete(agentId)
      return true
    }
    return false
  }

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}