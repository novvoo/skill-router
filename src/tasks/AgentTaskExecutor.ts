import { EventEmitter } from 'events'
import { AgentManager } from '../agents/AgentManager.js'
import { AgentInstance } from '../agents/AgentDefinition.js'
import { taskManager, TaskCreateOptions, AgentTaskState } from './TaskManager.js'

export interface AgentTaskOptions extends TaskCreateOptions {
  agentType: string
  prompt: string
  model?: string
  background?: boolean
  retain?: boolean
  workingDir?: string
}

export interface AgentProgress {
  toolUseCount: number
  tokenCount: number
  lastActivity?: string
  recentActivities: string[]
  summary?: string
}

export class AgentTaskExecutor extends EventEmitter {
  private agentManager: AgentManager
  private runningAgents = new Map<string, AgentInstance>()

  constructor() {
    super()
    this.agentManager = AgentManager.getInstance()
  }

  // 创建并启动Agent任务
  async spawnAgentTask(options: AgentTaskOptions): Promise<string> {
    const taskId = taskManager.generateTaskId('agent_task')
    
    // 创建Agent任务状态
    const taskState: AgentTaskState = {
      id: taskId,
      type: 'agent_task',
      status: 'pending',
      description: options.description,
      toolUseId: options.toolUseId,
      startTime: Date.now(),
      outputFile: '',
      outputOffset: 0,
      notified: false,
      priority: options.priority || 'normal',
      tags: options.tags || [],
      metadata: options.metadata || {},
      
      // Agent特定字段
      agentType: options.agentType,
      agentId: '',
      prompt: options.prompt,
      model: options.model,
      isBackgrounded: options.background || false,
      messages: [],
      pendingMessages: [],
      retain: options.retain || false,
      diskLoaded: false
    }

    // 注册任务
    await taskManager.registerTask(taskState)

    // 启动Agent
    try {
      // 从环境变量获取OpenAI配置
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
      const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim()
      const model = String(process.env.OPENAI_MODEL || "").trim()
      
      const agentInstance = await this.agentManager.spawnAgent(
        options.agentType,
        options.prompt,
        {
          description: options.description,
          background: options.background || false,
          model: options.model || model,
          sessionId: taskId,
          workingDir: options.workingDir,
          // 传递OpenAI配置
          openaiConfig: {
            apiKey,
            baseUrl,
            model: options.model || model
          },
          // 传递进度回调
          onProgress: (progress) => {
            this.updateAgentProgress(taskId, {
              toolUseCount: progress.data?.toolUseCount || 0,
              tokenCount: progress.data?.tokenCount || 0,
              lastActivity: progress.message,
              recentActivities: [...(taskState.progress?.recentActivities || []), progress.message].slice(-10)
            })
            this.emit('progressUpdate', { taskId, progress })
          }
        }
      )

      // 更新任务状态
      taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
        ...task,
        agentId: agentInstance.id,
        status: 'running'
      }))

      this.runningAgents.set(taskId, agentInstance)

      // 设置Agent完成回调
      this.agentManager.onAgentComplete(agentInstance.id, (result) => {
        this.handleAgentComplete(taskId, result)
      })

      this.agentManager.onAgentError(agentInstance.id, (error) => {
        this.handleAgentError(taskId, error)
      })

      // 注册清理回调
      taskManager.registerTaskCleanup(taskId, () => {
        this.cleanupAgent(taskId)
      })

      // 如果是后台任务，立即后台化
      if (options.background) {
        await taskManager.backgroundTask(taskId)
      }

      await taskManager.startTask(taskId)
      
      this.emit('agentSpawned', { taskId, agentId: agentInstance.id, agentType: options.agentType })

      return taskId

    } catch (error) {
      await taskManager.failTask(taskId, error)
      throw error
    }
  }

  // 向Agent发送消息
  async sendMessageToAgent(taskId: string, message: string): Promise<void> {
    const task = taskManager.getTask(taskId) as AgentTaskState
    if (!task || task.type !== 'agent_task') {
      throw new Error(`Agent task not found: ${taskId}`)
    }

    // 将消息添加到待处理队列
    taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
      ...task,
      pendingMessages: [...task.pendingMessages, message]
    }))

    // 如果Agent正在运行，立即处理消息
    const agentInstance = this.runningAgents.get(taskId)
    if (agentInstance && task.status === 'running') {
      // 这里需要实现向运行中的Agent发送消息的逻辑
      // 具体实现取决于AgentInstance的API
      this.emit('messageSent', { taskId, message })
    }
  }

  // 更新Agent进度
  updateAgentProgress(taskId: string, progress: Partial<AgentProgress>): void {
    taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
      ...task,
      progress: {
        toolUseCount: progress.toolUseCount || task.progress?.toolUseCount || 0,
        tokenCount: progress.tokenCount || task.progress?.tokenCount || 0,
        lastActivity: progress.lastActivity || task.progress?.lastActivity,
        recentActivities: progress.recentActivities || task.progress?.recentActivities || [],
        summary: progress.summary || task.progress?.summary
      }
    }))

    this.emit('progressUpdate', { taskId, progress })
  }

  // 暂停Agent任务
  async pauseAgentTask(taskId: string): Promise<void> {
    const agentInstance = this.runningAgents.get(taskId)
    if (!agentInstance) {
      throw new Error(`Agent instance not found: ${taskId}`)
    }

    // 暂停Agent执行 - 目前AgentInstance不支持暂停，先标记状态
    // agentInstance.pause?.()

    taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
      ...task,
      status: 'paused'
    }))

    this.emit('agentPaused', { taskId })
  }

  // 恢复Agent任务
  async resumeAgentTask(taskId: string): Promise<void> {
    const agentInstance = this.runningAgents.get(taskId)
    if (!agentInstance) {
      throw new Error(`Agent instance not found: ${taskId}`)
    }

    // 恢复Agent执行 - 目前AgentInstance不支持恢复，先标记状态
    // agentInstance.resume?.()

    taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
      ...task,
      status: 'running'
    }))

    this.emit('agentResumed', { taskId })
  }

  // 后台化Agent任务
  async backgroundAgentTask(taskId: string): Promise<boolean> {
    const success = await taskManager.backgroundTask(taskId)
    if (success) {
      this.emit('agentBackgrounded', { taskId })
    }
    return success
  }

  // 前台化Agent任务
  async foregroundAgentTask(taskId: string): Promise<boolean> {
    const success = await taskManager.foregroundTask(taskId)
    if (success) {
      this.emit('agentForegrounded', { taskId })
    }
    return success
  }

  // 获取Agent任务状态
  getAgentTask(taskId: string): AgentTaskState | undefined {
    const task = taskManager.getTask(taskId)
    return task?.type === 'agent_task' ? task as AgentTaskState : undefined
  }

  // 获取所有Agent任务
  getAllAgentTasks(): AgentTaskState[] {
    return taskManager.getAllTasks()
      .filter(task => task.type === 'agent_task') as AgentTaskState[]
  }

  // 获取运行中的Agent任务
  getRunningAgentTasks(): AgentTaskState[] {
    return taskManager.getRunningTasks()
      .filter(task => task.type === 'agent_task') as AgentTaskState[]
  }

  // 处理Agent完成
  private async handleAgentComplete(taskId: string, result: any): Promise<void> {
    const task = this.getAgentTask(taskId)
    if (!task) return

    // 更新任务状态
    taskManager.updateTaskState<AgentTaskState>(taskId, task => ({
      ...task,
      metadata: { ...task.metadata, result }
    }))

    await taskManager.completeTask(taskId, result)
    this.runningAgents.delete(taskId)

    this.emit('agentCompleted', { taskId, result })
  }

  // 处理Agent错误
  private async handleAgentError(taskId: string, error: any): Promise<void> {
    await taskManager.failTask(taskId, error)
    this.runningAgents.delete(taskId)

    this.emit('agentFailed', { taskId, error })
  }

  // 清理Agent资源
  private cleanupAgent(taskId: string): void {
    const agentInstance = this.runningAgents.get(taskId)
    if (agentInstance) {
      agentInstance.abort()
      this.runningAgents.delete(taskId)
    }

    this.emit('agentCleaned', { taskId })
  }

  // 终止Agent任务
  async killAgentTask(taskId: string): Promise<void> {
    await taskManager.killTask(taskId)
    this.emit('agentKilled', { taskId })
  }

  // 获取Agent任务统计
  getAgentTaskStats(): {
    total: number
    running: number
    completed: number
    failed: number
    background: number
  } {
    const agentTasks = this.getAllAgentTasks()
    
    return {
      total: agentTasks.length,
      running: agentTasks.filter(t => t.status === 'running').length,
      completed: agentTasks.filter(t => t.status === 'completed').length,
      failed: agentTasks.filter(t => t.status === 'failed').length,
      background: agentTasks.filter(t => t.isBackgrounded).length
    }
  }
}

// 导出单例实例
export const agentTaskExecutor = new AgentTaskExecutor()