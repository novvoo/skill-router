import { EventEmitter } from 'events'
import { taskManager, TaskState, TaskNotification } from './TaskManager.js'
import { agentTaskExecutor, AgentTaskOptions } from './AgentTaskExecutor.js'
import { shellTaskExecutor, ShellTaskOptions } from './ShellTaskExecutor.js'

// 统一的任务API接口
export interface TaskAPI {
  // 任务创建
  spawnAgentTask(options: AgentTaskOptions): Promise<string>
  spawnShellTask(options: ShellTaskOptions): Promise<string>
  
  // 任务控制
  killTask(taskId: string): Promise<void>
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
  backgroundTask(taskId: string): Promise<boolean>
  foregroundTask(taskId: string): Promise<boolean>
  backgroundAllTasks(): Promise<void>
  
  // 任务查询
  getTask(taskId: string): TaskState | undefined
  getAllTasks(): TaskState[]
  getRunningTasks(): TaskState[]
  getBackgroundTasks(): TaskState[]
  getForegroundTasks(): TaskState[]
  hasForegroundTasks(): boolean
  
  // 任务交互
  sendMessageToAgent(taskId: string, message: string): Promise<void>
  sendInputToShell(taskId: string, input: string): Promise<void>
  
  // 通知管理
  getNotifications(): TaskNotification[]
  clearNotifications(): void
  
  // 统计信息
  getTaskStats(): any
  
  // 事件监听
  on(event: string, listener: (...args: any[]) => void): void
  off(event: string, listener: (...args: any[]) => void): void
}

// 任务API实现
export class TaskAPIImpl extends EventEmitter implements TaskAPI {
  private static instance: TaskAPIImpl

  private constructor() {
    super()
    this.setupEventForwarding()
  }

  static getInstance(): TaskAPIImpl {
    if (!TaskAPIImpl.instance) {
      TaskAPIImpl.instance = new TaskAPIImpl()
    }
    return TaskAPIImpl.instance
  }

  // 设置事件转发
  private setupEventForwarding(): void {
    // 转发任务管理器事件
    taskManager.on('taskEvent', (event) => {
      this.emit('taskEvent', event)
    })

    taskManager.on('notification', (notification) => {
      this.emit('notification', notification)
    })

    // 转发Agent任务执行器事件
    agentTaskExecutor.on('agentSpawned', (data) => {
      this.emit('agentSpawned', data)
    })

    agentTaskExecutor.on('agentCompleted', (data) => {
      this.emit('agentCompleted', data)
    })

    agentTaskExecutor.on('agentFailed', (data) => {
      this.emit('agentFailed', data)
    })

    agentTaskExecutor.on('agentBackgrounded', (data) => {
      this.emit('agentBackgrounded', data)
    })

    agentTaskExecutor.on('progressUpdate', (data) => {
      this.emit('agentProgress', data)
    })

    // 转发Shell任务执行器事件
    shellTaskExecutor.on('shellSpawned', (data) => {
      this.emit('shellSpawned', data)
    })

    shellTaskExecutor.on('shellCompleted', (data) => {
      this.emit('shellCompleted', data)
    })

    shellTaskExecutor.on('shellFailed', (data) => {
      this.emit('shellFailed', data)
    })

    shellTaskExecutor.on('shellOutput', (data) => {
      this.emit('shellOutput', data)
    })

    shellTaskExecutor.on('shellStalled', (data) => {
      this.emit('shellStalled', data)
    })

    shellTaskExecutor.on('shellBackgrounded', (data) => {
      this.emit('shellBackgrounded', data)
    })
  }

  // 创建Agent任务
  async spawnAgentTask(options: AgentTaskOptions): Promise<string> {
    return await agentTaskExecutor.spawnAgentTask(options)
  }

  // 创建Shell任务
  async spawnShellTask(options: ShellTaskOptions): Promise<string> {
    return await shellTaskExecutor.spawnShellTask(options)
  }

  // 终止任务
  async killTask(taskId: string): Promise<void> {
    const task = taskManager.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    switch (task.type) {
      case 'agent_task':
        await agentTaskExecutor.killAgentTask(taskId)
        break
      case 'shell_task':
        await shellTaskExecutor.killShellTask(taskId)
        break
      default:
        await taskManager.killTask(taskId)
    }
  }

  // 暂停任务
  async pauseTask(taskId: string): Promise<void> {
    const task = taskManager.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    switch (task.type) {
      case 'agent_task':
        await agentTaskExecutor.pauseAgentTask(taskId)
        break
      case 'shell_task':
        // Shell任务暂停需要发送SIGSTOP信号
        throw new Error('Shell task pause not implemented yet')
      default:
        throw new Error(`Pause not supported for task type: ${task.type}`)
    }
  }

  // 恢复任务
  async resumeTask(taskId: string): Promise<void> {
    const task = taskManager.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    switch (task.type) {
      case 'agent_task':
        await agentTaskExecutor.resumeAgentTask(taskId)
        break
      case 'shell_task':
        // Shell任务恢复需要发送SIGCONT信号
        throw new Error('Shell task resume not implemented yet')
      default:
        throw new Error(`Resume not supported for task type: ${task.type}`)
    }
  }

  // 后台化任务
  async backgroundTask(taskId: string): Promise<boolean> {
    const task = taskManager.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    switch (task.type) {
      case 'agent_task':
        return await agentTaskExecutor.backgroundAgentTask(taskId)
      case 'shell_task':
        return await shellTaskExecutor.backgroundShellTask(taskId)
      default:
        return await taskManager.backgroundTask(taskId)
    }
  }

  // 前台化任务
  async foregroundTask(taskId: string): Promise<boolean> {
    const task = taskManager.getTask(taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    switch (task.type) {
      case 'agent_task':
        return await agentTaskExecutor.foregroundAgentTask(taskId)
      case 'shell_task':
        return await shellTaskExecutor.foregroundShellTask(taskId)
      default:
        return await taskManager.foregroundTask(taskId)
    }
  }

  // 后台化所有任务
  async backgroundAllTasks(): Promise<void> {
    await taskManager.backgroundAllTasks()
  }

  // 获取任务
  getTask(taskId: string): TaskState | undefined {
    return taskManager.getTask(taskId)
  }

  // 获取所有任务
  getAllTasks(): TaskState[] {
    return taskManager.getAllTasks()
  }

  // 获取运行中的任务
  getRunningTasks(): TaskState[] {
    return taskManager.getRunningTasks()
  }

  // 获取后台任务
  getBackgroundTasks(): TaskState[] {
    return taskManager.getBackgroundTasks()
  }

  // 获取前台任务
  getForegroundTasks(): TaskState[] {
    return taskManager.getForegroundTasks()
  }

  // 检查是否有前台任务
  hasForegroundTasks(): boolean {
    return taskManager.hasForegroundTasks()
  }

  // 向Agent发送消息
  async sendMessageToAgent(taskId: string, message: string): Promise<void> {
    const task = taskManager.getTask(taskId)
    if (!task || task.type !== 'agent_task') {
      throw new Error(`Agent task not found: ${taskId}`)
    }

    await agentTaskExecutor.sendMessageToAgent(taskId, message)
  }

  // 向Shell发送输入
  async sendInputToShell(taskId: string, input: string): Promise<void> {
    const task = taskManager.getTask(taskId)
    if (!task || task.type !== 'shell_task') {
      throw new Error(`Shell task not found: ${taskId}`)
    }

    await shellTaskExecutor.sendInputToShell(taskId, input)
  }

  // 获取通知
  getNotifications(): TaskNotification[] {
    return taskManager.getNotificationQueue()
  }

  // 清空通知
  clearNotifications(): void {
    taskManager.clearNotificationQueue()
  }

  // 获取任务统计
  getTaskStats(): {
    overall: any
    agent: any
    shell: any
  } {
    return {
      overall: taskManager.getTaskStats(),
      agent: agentTaskExecutor.getAgentTaskStats(),
      shell: shellTaskExecutor.getShellTaskStats()
    }
  }

  // 获取任务详细信息（用于调试）
  getTaskDetails(taskId: string): any {
    const task = taskManager.getTask(taskId)
    if (!task) return null

    const details: any = {
      ...task,
      isRunning: task.status === 'running',
      duration: task.endTime ? task.endTime - task.startTime : Date.now() - task.startTime,
      hasOutput: task.outputOffset > 0
    }

    // 添加类型特定的详细信息
    switch (task.type) {
      case 'agent_task':
        const agentTask = agentTaskExecutor.getAgentTask(taskId)
        if (agentTask) {
          details.agentDetails = {
            progress: agentTask.progress,
            messageCount: agentTask.messages.length,
            pendingMessageCount: agentTask.pendingMessages.length,
            retain: agentTask.retain,
            diskLoaded: agentTask.diskLoaded
          }
        }
        break
      case 'shell_task':
        const shellTask = shellTaskExecutor.getShellTask(taskId)
        if (shellTask) {
          details.shellDetails = {
            pid: shellTask.pid,
            workingDir: shellTask.workingDir,
            environment: shellTask.environment,
            result: shellTask.result
          }
        }
        break
    }

    return details
  }

  // 搜索任务
  searchTasks(query: {
    type?: TaskState['type']
    status?: TaskState['status']
    tags?: string[]
    description?: string
    priority?: 'low' | 'normal' | 'high'
  }): TaskState[] {
    let tasks = this.getAllTasks()

    if (query.type) {
      tasks = tasks.filter(task => task.type === query.type)
    }

    if (query.status) {
      tasks = tasks.filter(task => task.status === query.status)
    }

    if (query.tags && query.tags.length > 0) {
      tasks = tasks.filter(task => 
        query.tags!.some(tag => task.tags.includes(tag))
      )
    }

    if (query.description) {
      const searchTerm = query.description.toLowerCase()
      tasks = tasks.filter(task => 
        task.description.toLowerCase().includes(searchTerm)
      )
    }

    if (query.priority) {
      tasks = tasks.filter(task => task.priority === query.priority)
    }

    return tasks
  }
}

// 导出单例实例
export const taskAPI = TaskAPIImpl.getInstance()

// 导出类型
export type { TaskState } from './TaskManager.js'
export type { AgentTaskState, ShellTaskState, ToolTaskState, WorkflowTaskState, CoordinatorTaskState, TaskType, TaskStatus } from './TaskManager.js'