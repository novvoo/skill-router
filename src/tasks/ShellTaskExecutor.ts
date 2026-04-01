import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'
import { taskManager, TaskCreateOptions, ShellTaskState } from './TaskManager.js'

export interface ShellTaskOptions extends TaskCreateOptions {
  command: string
  args?: string[]
  workingDir?: string
  environment?: Record<string, string>
  timeout?: number
  background?: boolean
  shell?: boolean
}

export interface ShellTaskResult {
  code: number
  signal?: string
  interrupted: boolean
  stdout: string
  stderr: string
}

export class ShellTaskExecutor extends EventEmitter {
  private runningProcesses = new Map<string, ChildProcess>()
  private taskTimeouts = new Map<string, NodeJS.Timeout>()
  private stallWatchdogs = new Map<string, NodeJS.Timeout>()

  // 检测交互式提示的模式
  private readonly PROMPT_PATTERNS = [
    /\(y\/n\)/i,           // (Y/n), (y/N)
    /\[y\/n\]/i,           // [Y/n], [y/N]
    /\(yes\/no\)/i,
    /\b(?:Do you|Would you|Shall I|Are you sure|Ready to)\b.*\? *$/i,
    /Press (any key|Enter)/i,
    /Continue\?/i,
    /Overwrite\?/i,
    /Password:/i,
    /Enter passphrase/i
  ]

  private readonly STALL_CHECK_INTERVAL = 5000  // 5秒
  private readonly STALL_THRESHOLD = 45000      // 45秒
  private readonly STALL_TAIL_BYTES = 1024      // 检查最后1KB输出

  constructor() {
    super()
  }

  // 创建并启动Shell任务
  async spawnShellTask(options: ShellTaskOptions): Promise<string> {
    const taskId = taskManager.generateTaskId('shell_task')
    
    // 创建Shell任务状态
    const taskState: ShellTaskState = {
      id: taskId,
      type: 'shell_task',
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
      
      // Shell特定字段
      command: options.command,
      workingDir: options.workingDir,
      environment: options.environment,
      isBackgrounded: options.background || false
    }

    // 注册任务
    await taskManager.registerTask(taskState)

    try {
      // 启动进程
      const childProcess = await this.startProcess(taskId, options)
      
      // 更新任务状态
      taskManager.updateTaskState<ShellTaskState>(taskId, task => ({
        ...task,
        status: 'running',
        pid: childProcess.pid
      }))

      this.runningProcesses.set(taskId, childProcess)

      // 设置超时
      if (options.timeout) {
        this.setTaskTimeout(taskId, options.timeout)
      }

      // 启动停滞检测
      this.startStallWatchdog(taskId, options.description)

      // 注册清理回调
      taskManager.registerTaskCleanup(taskId, () => {
        this.cleanupProcess(taskId)
      })

      // 如果是后台任务，立即后台化
      if (options.background) {
        await taskManager.backgroundTask(taskId)
      }

      await taskManager.startTask(taskId)
      
      this.emit('shellSpawned', { taskId, command: options.command, pid: childProcess.pid })

      return taskId

    } catch (error) {
      await taskManager.failTask(taskId, error)
      throw error
    }
  }

  // 启动进程
  private async startProcess(taskId: string, options: ShellTaskOptions): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...options.environment
      }

      let childProcess: ChildProcess

      if (options.shell || !options.args) {
        // 使用shell执行命令
        const shell = platform() === 'win32' ? 'cmd.exe' : '/bin/bash'
        const shellArgs = platform() === 'win32' 
          ? ['/c', options.command]
          : ['-c', options.command]
        
        childProcess = spawn(shell, shellArgs, {
          cwd: options.workingDir || process.cwd(),
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      } else {
        // 直接执行命令
        childProcess = spawn(options.command, options.args || [], {
          cwd: options.workingDir || process.cwd(),
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      }

      // 处理启动错误
      childProcess.on('error', (error) => {
        reject(new Error(`Failed to start process: ${error.message}`))
      })

      // 等待进程启动
      childProcess.on('spawn', () => {
        resolve(childProcess)
      })

      // 处理输出
      let stdoutBuffer = ''
      let stderrBuffer = ''

      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString()
        stdoutBuffer += chunk
        void taskManager.writeTaskOutput(taskId, chunk)
        this.emit('shellOutput', { taskId, type: 'stdout', data: chunk })
      })

      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString()
        stderrBuffer += chunk
        void taskManager.writeTaskOutput(taskId, `[STDERR] ${chunk}`)
        this.emit('shellOutput', { taskId, type: 'stderr', data: chunk })
      })

      // 处理进程退出
      childProcess.on('exit', (code, signal) => {
        this.handleProcessExit(taskId, code, signal, stdoutBuffer, stderrBuffer)
      })

      // 处理进程关闭
      childProcess.on('close', (code, signal) => {
        this.handleProcessClose(taskId, code, signal)
      })
    })
  }

  // 处理进程退出
  private async handleProcessExit(
    taskId: string, 
    code: number | null, 
    signal: string | null,
    stdout: string,
    stderr: string
  ): Promise<void> {
    const task = this.getShellTask(taskId)
    if (!task) return

    const result: ShellTaskResult = {
      code: code || 0,
      signal: signal || undefined,
      interrupted: signal !== null,
      stdout,
      stderr
    }

    // 更新任务状态
    taskManager.updateTaskState<ShellTaskState>(taskId, task => ({
      ...task,
      result: {
        code: result.code,
        signal: result.signal,
        interrupted: result.interrupted
      },
      metadata: { ...task.metadata, result }
    }))

    // 清理资源
    this.cleanupProcess(taskId)

    // 完成或失败任务
    if (result.code === 0) {
      await taskManager.completeTask(taskId, result)
      this.emit('shellCompleted', { taskId, result })
    } else {
      await taskManager.failTask(taskId, `Process exited with code ${result.code}`)
      this.emit('shellFailed', { taskId, result })
    }
  }

  // 处理进程关闭
  private handleProcessClose(taskId: string, code: number | null, signal: string | null): void {
    this.emit('shellClosed', { taskId, code, signal })
  }

  // 设置任务超时
  private setTaskTimeout(taskId: string, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      this.killShellTask(taskId, 'timeout')
    }, timeoutMs)

    this.taskTimeouts.set(taskId, timeout)
  }

  // 启动停滞检测
  private startStallWatchdog(taskId: string, description: string): void {
    let lastOutputTime = Date.now()
    let lastOutputSize = 0

    const watchdog = setInterval(async () => {
      const task = this.getShellTask(taskId)
      if (!task || task.status !== 'running') {
        clearInterval(watchdog)
        return
      }

      const currentSize = task.outputOffset
      const now = Date.now()

      // 检查输出是否有增长
      if (currentSize > lastOutputSize) {
        lastOutputSize = currentSize
        lastOutputTime = now
        return
      }

      // 检查是否超过停滞阈值
      if (now - lastOutputTime < this.STALL_THRESHOLD) {
        return
      }

      // 检查最后的输出是否像交互式提示
      try {
        const tailOutput = await this.getTaskOutputTail(taskId, this.STALL_TAIL_BYTES)
        if (this.looksLikePrompt(tailOutput)) {
          clearInterval(watchdog)
          await this.notifyStallDetected(taskId, description, tailOutput)
        } else {
          // 重置计时器，避免对慢速命令误报
          lastOutputTime = now
        }
      } catch (error) {
        // 忽略读取输出错误
      }
    }, this.STALL_CHECK_INTERVAL)

    this.stallWatchdogs.set(taskId, watchdog)
  }

  // 检查输出是否像交互式提示
  private looksLikePrompt(output: string): boolean {
    const lastLine = output.trimEnd().split('\n').pop() || ''
    return this.PROMPT_PATTERNS.some(pattern => pattern.test(lastLine))
  }

  // 获取任务输出尾部
  private async getTaskOutputTail(taskId: string, bytes: number): Promise<string> {
    const task = this.getShellTask(taskId)
    if (!task) return ''

    try {
      const { readFile } = await import('fs/promises')
      const content = await readFile(task.outputFile, 'utf8')
      return content.slice(-bytes)
    } catch {
      return ''
    }
  }

  // 通知检测到停滞
  private async notifyStallDetected(taskId: string, description: string, tailOutput: string): Promise<void> {
    const summary = `Shell command "${description}" appears to be waiting for interactive input`
    
    await taskManager.writeTaskOutput(taskId, `\n[SYSTEM] ${summary}\n`)
    await taskManager.writeTaskOutput(taskId, `[SYSTEM] Last output:\n${tailOutput}\n`)
    
    this.emit('shellStalled', { 
      taskId, 
      description, 
      summary,
      tailOutput 
    })
  }

  // 向进程发送输入
  async sendInputToShell(taskId: string, input: string): Promise<void> {
    const process = this.runningProcesses.get(taskId)
    if (!process || !process.stdin) {
      throw new Error(`Shell process not found or stdin not available: ${taskId}`)
    }

    process.stdin.write(input)
    await taskManager.writeTaskOutput(taskId, `[INPUT] ${input}`)
    
    this.emit('shellInput', { taskId, input })
  }

  // 后台化Shell任务
  async backgroundShellTask(taskId: string): Promise<boolean> {
    const success = await taskManager.backgroundTask(taskId)
    if (success) {
      this.emit('shellBackgrounded', { taskId })
    }
    return success
  }

  // 前台化Shell任务
  async foregroundShellTask(taskId: string): Promise<boolean> {
    const success = await taskManager.foregroundTask(taskId)
    if (success) {
      this.emit('shellForegrounded', { taskId })
    }
    return success
  }

  // 终止Shell任务
  async killShellTask(taskId: string, reason: string = 'manual'): Promise<void> {
    const process = this.runningProcesses.get(taskId)
    if (process) {
      // 尝试优雅终止
      process.kill('SIGTERM')
      
      // 如果5秒后还没退出，强制终止
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL')
        }
      }, 5000)
    }

    await taskManager.killTask(taskId)
    this.emit('shellKilled', { taskId, reason })
  }

  // 清理进程资源
  private cleanupProcess(taskId: string): void {
    // 清理进程
    const process = this.runningProcesses.get(taskId)
    if (process && !process.killed) {
      process.kill('SIGKILL')
    }
    this.runningProcesses.delete(taskId)

    // 清理超时器
    const timeout = this.taskTimeouts.get(taskId)
    if (timeout) {
      clearTimeout(timeout)
      this.taskTimeouts.delete(taskId)
    }

    // 清理停滞检测
    const watchdog = this.stallWatchdogs.get(taskId)
    if (watchdog) {
      clearInterval(watchdog)
      this.stallWatchdogs.delete(taskId)
    }

    this.emit('shellCleaned', { taskId })
  }

  // 获取Shell任务状态
  getShellTask(taskId: string): ShellTaskState | undefined {
    const task = taskManager.getTask(taskId)
    return task?.type === 'shell_task' ? task as ShellTaskState : undefined
  }

  // 获取所有Shell任务
  getAllShellTasks(): ShellTaskState[] {
    return taskManager.getAllTasks()
      .filter(task => task.type === 'shell_task') as ShellTaskState[]
  }

  // 获取运行中的Shell任务
  getRunningShellTasks(): ShellTaskState[] {
    return taskManager.getRunningTasks()
      .filter(task => task.type === 'shell_task') as ShellTaskState[]
  }

  // 获取Shell任务统计
  getShellTaskStats(): {
    total: number
    running: number
    completed: number
    failed: number
    background: number
  } {
    const shellTasks = this.getAllShellTasks()
    
    return {
      total: shellTasks.length,
      running: shellTasks.filter(t => t.status === 'running').length,
      completed: shellTasks.filter(t => t.status === 'completed').length,
      failed: shellTasks.filter(t => t.status === 'failed').length,
      background: shellTasks.filter(t => t.isBackgrounded).length
    }
  }
}

// 导出单例实例
export const shellTaskExecutor = new ShellTaskExecutor()