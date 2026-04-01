import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// 任务类型定义
export type TaskType =
  | 'agent_task'        // Agent任务
  | 'shell_task'        // Shell命令任务
  | 'tool_task'         // 工具执行任务
  | 'workflow_task'     // 工作流任务
  | 'coordinator_task'  // 协调器任务

// 任务状态定义
export type TaskStatus =
  | 'pending'    // 等待中
  | 'running'    // 运行中
  | 'completed'  // 已完成
  | 'failed'     // 失败
  | 'killed'     // 被终止
  | 'paused'     // 暂停

// 任务基础状态
export interface TaskStateBase {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  toolUseId?: string
  startTime: number
  endTime?: number
  totalPausedMs?: number
  outputFile: string
  outputOffset: number
  notified: boolean
  priority: 'low' | 'normal' | 'high'
  tags: string[]
  metadata: Record<string, any>
}

// Agent任务状态
export interface AgentTaskState extends TaskStateBase {
  type: 'agent_task'
  agentType: string
  agentId: string
  prompt: string
  model?: string
  isBackgrounded: boolean
  progress?: {
    toolUseCount: number
    tokenCount: number
    lastActivity?: string
    recentActivities: string[]
    summary?: string
  }
  messages: any[]
  pendingMessages: string[]
  retain: boolean
  diskLoaded: boolean
  evictAfter?: number
}

// Shell任务状态
export interface ShellTaskState extends TaskStateBase {
  type: 'shell_task'
  command: string
  workingDir?: string
  environment?: Record<string, string>
  result?: {
    code: number
    signal?: string
    interrupted: boolean
  }
  isBackgrounded: boolean
  pid?: number
}

// 工具任务状态
export interface ToolTaskState extends TaskStateBase {
  type: 'tool_task'
  toolName: string
  toolInput: Record<string, any>
  toolOutput?: any
  isBackgrounded: boolean
}

// 工作流任务状态
export interface WorkflowTaskState extends TaskStateBase {
  type: 'workflow_task'
  workflowName: string
  steps: WorkflowStep[]
  currentStep: number
  isBackgrounded: boolean
}

// 协调器任务状态
export interface CoordinatorTaskState extends TaskStateBase {
  type: 'coordinator_task'
  coordinatorType: string
  subTasks: string[]
  isBackgrounded: boolean
}

export interface WorkflowStep {
  id: string
  name: string
  type: 'agent' | 'tool' | 'shell'
  config: Record<string, any>
  status: TaskStatus
  result?: any
  dependencies: string[]
}

// 联合任务状态类型
export type TaskState = 
  | AgentTaskState 
  | ShellTaskState 
  | ToolTaskState 
  | WorkflowTaskState 
  | CoordinatorTaskState

// 任务创建选项
export interface TaskCreateOptions {
  description: string
  priority?: 'low' | 'normal' | 'high'
  tags?: string[]
  metadata?: Record<string, any>
  background?: boolean
  toolUseId?: string
}

// 任务事件
export interface TaskEvent {
  taskId: string
  type: 'created' | 'started' | 'progress' | 'completed' | 'failed' | 'killed' | 'backgrounded'
  timestamp: number
  data?: any
}

// 任务通知
export interface TaskNotification {
  taskId: string
  status: TaskStatus
  summary: string
  outputFile?: string
  toolUseId?: string
  priority: 'low' | 'normal' | 'high'
}

// 任务ID生成器
const TASK_ID_PREFIXES: Record<TaskType, string> = {
  agent_task: 'a',
  shell_task: 's', 
  tool_task: 't',
  workflow_task: 'w',
  coordinator_task: 'c'
}

const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function generateTaskId(type: TaskType): string {
  const prefix = TASK_ID_PREFIXES[type] ?? 'x'
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}

// 任务输出管理
function getTaskOutputPath(taskId: string): string {
  return join(process.cwd(), '.task-output', `${taskId}.log`)
}

async function ensureTaskOutputDir(): Promise<void> {
  await mkdir(join(process.cwd(), '.task-output'), { recursive: true })
}

// 任务管理器
export class TaskManager extends EventEmitter {
  private static instance: TaskManager
  private tasks = new Map<string, TaskState>()
  private backgroundTasks = new Set<string>()
  private taskCleanupCallbacks = new Map<string, (() => void)[]>()
  private notificationQueue: TaskNotification[] = []
  private maxTasks = 1000
  private maxBackgroundTasks = 50

  private constructor() {
    super()
    this.setupCleanupInterval()
  }

  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager()
    }
    return TaskManager.instance
  }

  // 创建任务基础状态
  private createTaskStateBase(
    id: string,
    type: TaskType,
    description: string,
    options: TaskCreateOptions
  ): TaskStateBase {
    return {
      id,
      type,
      status: 'pending',
      description,
      toolUseId: options.toolUseId,
      startTime: Date.now(),
      outputFile: getTaskOutputPath(id),
      outputOffset: 0,
      notified: false,
      priority: options.priority || 'normal',
      tags: options.tags || [],
      metadata: options.metadata || {}
    }
  }

  // 注册任务
  async registerTask(taskState: TaskState): Promise<void> {
    await ensureTaskOutputDir()
    
    this.tasks.set(taskState.id, taskState)
    
    // 限制任务数量
    if (this.tasks.size > this.maxTasks) {
      this.evictOldTasks()
    }

    this.emitTaskEvent(taskState.id, 'created', { task: taskState })
  }

  // 更新任务状态
  updateTaskState<T extends TaskState>(
    taskId: string,
    updater: (task: T) => T
  ): void {
    const task = this.tasks.get(taskId) as T
    if (!task) return

    const updatedTask = updater(task)
    this.tasks.set(taskId, updatedTask)

    this.emitTaskEvent(taskId, 'progress', { task: updatedTask })
  }

  // 启动任务
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'pending') return

    this.updateTaskState(taskId, (t: TaskState) => ({
      ...t,
      status: 'running',
      startTime: Date.now()
    }))

    this.emitTaskEvent(taskId, 'started', { task })
  }

  // 完成任务
  async completeTask(taskId: string, result?: any): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    this.updateTaskState(taskId, (t: TaskState) => ({
      ...t,
      status: 'completed',
      endTime: Date.now(),
      metadata: { ...t.metadata, result }
    }))

    await this.enqueueNotification({
      taskId,
      status: 'completed',
      summary: `Task completed: ${task.description}`,
      outputFile: task.outputFile,
      toolUseId: task.toolUseId,
      priority: task.priority
    })

    this.emitTaskEvent(taskId, 'completed', { task, result })
    this.cleanupTask(taskId)
  }

  // 任务失败
  async failTask(taskId: string, error: any): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    this.updateTaskState(taskId, (t: TaskState) => ({
      ...t,
      status: 'failed',
      endTime: Date.now(),
      metadata: { ...t.metadata, error: String(error) }
    }))

    await this.enqueueNotification({
      taskId,
      status: 'failed',
      summary: `Task failed: ${task.description}`,
      outputFile: task.outputFile,
      toolUseId: task.toolUseId,
      priority: 'high'
    })

    this.emitTaskEvent(taskId, 'failed', { task, error })
    this.cleanupTask(taskId)
  }

  // 终止任务
  async killTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 执行清理回调
    const cleanupCallbacks = this.taskCleanupCallbacks.get(taskId) || []
    for (const cleanup of cleanupCallbacks) {
      try {
        cleanup()
      } catch (error) {
        console.error(`Task cleanup error for ${taskId}:`, error)
      }
    }

    this.updateTaskState(taskId, (t: TaskState) => ({
      ...t,
      status: 'killed',
      endTime: Date.now()
    }))

    await this.enqueueNotification({
      taskId,
      status: 'killed',
      summary: `Task killed: ${task.description}`,
      outputFile: task.outputFile,
      toolUseId: task.toolUseId,
      priority: task.priority
    })

    this.emitTaskEvent(taskId, 'killed', { task })
    this.cleanupTask(taskId)
  }

  // 后台化任务
  async backgroundTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'running') return false

    // 检查后台任务数量限制
    if (this.backgroundTasks.size >= this.maxBackgroundTasks) {
      console.warn(`Background task limit reached (${this.maxBackgroundTasks})`)
      return false
    }

    this.backgroundTasks.add(taskId)

    // 更新任务状态为后台运行
    this.updateTaskState(taskId, (t: any) => ({
      ...t,
      isBackgrounded: true
    }))

    this.emitTaskEvent(taskId, 'backgrounded', { task })
    return true
  }

  // 前台化任务
  async foregroundTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) return false

    this.backgroundTasks.delete(taskId)

    this.updateTaskState(taskId, (t: any) => ({
      ...t,
      isBackgrounded: false
    }))

    return true
  }

  // 后台化所有前台任务
  async backgroundAllTasks(): Promise<void> {
    const foregroundTasks = Array.from(this.tasks.values())
      .filter(task => 
        task.status === 'running' && 
        'isBackgrounded' in task && 
        !task.isBackgrounded
      )

    for (const task of foregroundTasks) {
      await this.backgroundTask(task.id)
    }
  }

  // 注册任务清理回调
  registerTaskCleanup(taskId: string, cleanup: () => void): void {
    const callbacks = this.taskCleanupCallbacks.get(taskId) || []
    callbacks.push(cleanup)
    this.taskCleanupCallbacks.set(taskId, callbacks)
  }

  // 获取任务
  getTask(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId)
  }

  // 获取所有任务
  getAllTasks(): TaskState[] {
    return Array.from(this.tasks.values())
  }

  // 获取运行中的任务
  getRunningTasks(): TaskState[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'running')
  }

  // 获取后台任务
  getBackgroundTasks(): TaskState[] {
    return Array.from(this.tasks.values())
      .filter(task => 
        this.backgroundTasks.has(task.id) && 
        task.status === 'running'
      )
  }

  // 获取前台任务
  getForegroundTasks(): TaskState[] {
    return Array.from(this.tasks.values())
      .filter(task => 
        task.status === 'running' && 
        'isBackgrounded' in task && 
        !task.isBackgrounded
      )
  }

  // 检查是否有前台任务
  hasForegroundTasks(): boolean {
    return this.getForegroundTasks().length > 0
  }

  // 写入任务输出
  async writeTaskOutput(taskId: string, data: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    try {
      await writeFile(task.outputFile, data, { flag: 'a' })
      
      this.updateTaskState(taskId, (t: TaskState) => ({
        ...t,
        outputOffset: t.outputOffset + Buffer.byteLength(data, 'utf8')
      }))
    } catch (error) {
      console.error(`Failed to write task output for ${taskId}:`, error)
    }
  }

  // 入队通知
  private async enqueueNotification(notification: TaskNotification): Promise<void> {
    // 检查是否已经通知过
    const task = this.tasks.get(notification.taskId)
    if (task?.notified) return

    // 标记为已通知
    this.updateTaskState(notification.taskId, (t: TaskState) => ({
      ...t,
      notified: true
    }))

    this.notificationQueue.push(notification)
    this.emit('notification', notification)
  }

  // 获取通知队列
  getNotificationQueue(): TaskNotification[] {
    return [...this.notificationQueue]
  }

  // 清空通知队列
  clearNotificationQueue(): void {
    this.notificationQueue = []
  }

  // 发送任务事件
  private emitTaskEvent(taskId: string, type: TaskEvent['type'], data?: any): void {
    const event: TaskEvent = {
      taskId,
      type,
      timestamp: Date.now(),
      data
    }
    this.emit('taskEvent', event)
  }

  // 清理任务
  private cleanupTask(taskId: string): void {
    this.backgroundTasks.delete(taskId)
    this.taskCleanupCallbacks.delete(taskId)
    
    // 延迟删除任务状态，保留一段时间供查询
    setTimeout(() => {
      this.tasks.delete(taskId)
    }, 5 * 60 * 1000) // 5分钟后删除
  }

  // 清理旧任务
  private evictOldTasks(): void {
    const tasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'completed' || task.status === 'failed')
      .sort((a, b) => (a.endTime || 0) - (b.endTime || 0))

    // 删除最旧的已完成任务
    const toDelete = tasks.slice(0, Math.floor(this.maxTasks * 0.1))
    for (const task of toDelete) {
      this.tasks.delete(task.id)
      this.cleanupTask(task.id)
    }
  }

  // 设置清理定时器
  private setupCleanupInterval(): void {
    setInterval(() => {
      this.evictOldTasks()
    }, 10 * 60 * 1000) // 每10分钟清理一次
  }

  // 生成任务ID
  generateTaskId(type: TaskType): string {
    return generateTaskId(type)
  }

  // 获取任务统计
  getTaskStats(): {
    total: number
    running: number
    completed: number
    failed: number
    background: number
  } {
    const tasks = Array.from(this.tasks.values())
    
    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      background: this.backgroundTasks.size
    }
  }
}

// 导出单例实例
export const taskManager = TaskManager.getInstance()