import { AgentManager } from '../agents/AgentManager.js'
import { ToolExecutor } from '../tools/ToolExecutor.js'
import { taskAPI, TaskState } from '../tasks/TaskAPI.js'
import type { OpenAIConfig } from '../handler.js'

export interface SlashCommand {
  execute(args: string[]): Promise<void>
}

export class CommandProcessor {
  private agentManager: AgentManager
  private toolExecutor: ToolExecutor | null = null
  private availableCommands: Map<string, SlashCommand> = new Map()

  constructor() {
    this.agentManager = AgentManager.getInstance()
    this.setupCommands()
    this.setupTaskEventListeners()
  }

  setConfig(config: OpenAIConfig): void {
    this.toolExecutor = new ToolExecutor(config)
  }

  private setupCommands(): void {
    this.availableCommands = new Map([
      ['/help', new HelpCommand()],
      ['/agents', new ListAgentsCommand(this.agentManager)],
      ['/spawn', new SpawnAgentCommand()],
      ['/tasks', new ListTasksCommand()],
      ['/kill', new KillTaskCommand()],
      ['/message', new SendMessageCommand()],
      ['/input', new SendInputCommand()],
      ['/background', new BackgroundTaskCommand()],
      ['/foreground', new ForegroundTaskCommand()],
      ['/coordinator', new CoordinatorCommand()],
      ['/tools', new ListToolsCommand(this.toolExecutor)],
      ['/status', new StatusCommand()],
      ['/clear', new ClearCommand()],
      ['/shell', new ShellCommand()],
      ['/notifications', new NotificationsCommand()],
    ])
  }

  private setupTaskEventListeners(): void {
    // 监听任务事件并显示进度
    taskAPI.on('agentSpawned', (data) => {
      console.log(`🚀 Agent spawned: ${data.agentType} (${data.taskId})`)
    })

    taskAPI.on('agentCompleted', (data) => {
      console.log(`✅ Agent completed: ${data.taskId}`)
    })

    taskAPI.on('agentFailed', (data) => {
      console.log(`❌ Agent failed: ${data.taskId} - ${data.error}`)
    })

    taskAPI.on('shellSpawned', (data) => {
      console.log(`🐚 Shell spawned: ${data.command} (${data.taskId})`)
    })

    taskAPI.on('shellCompleted', (data) => {
      console.log(`✅ Shell completed: ${data.taskId} (exit code: ${data.result.code})`)
    })

    taskAPI.on('shellFailed', (data) => {
      console.log(`❌ Shell failed: ${data.taskId} (exit code: ${data.result.code})`)
    })

    taskAPI.on('shellStalled', (data) => {
      console.log(`⚠️  Shell stalled: ${data.taskId} - ${data.summary}`)
      console.log(`   Use '/input ${data.taskId} <input>' to provide input`)
    })

    taskAPI.on('notification', (notification) => {
      const icon = this.getStatusIcon(notification.status)
      console.log(`${icon} ${notification.summary}`)
    })
  }

  async processSlashCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.split(' ')
    const handler = this.availableCommands.get(cmd)

    if (!handler) {
      console.log(`❌ Unknown command: ${cmd}`)
      console.log('Type /help for available commands')
      return
    }

    await handler.execute(args)
  }

  async processNaturalLanguage(input: string): Promise<void> {
    console.log(`🤔 Processing: ${input}`)

    try {
      // 简单的意图识别
      if (this.isAgentSpawnRequest(input)) {
        await this.handleAgentSpawnRequest(input)
      } else if (this.isQuestionRequest(input)) {
        await this.handleQuestionRequest(input)
      } else {
        // 默认使用通用agent处理
        await this.handleGeneralRequest(input)
      }
    } catch (error) {
      console.error('❌ Error processing request:', error)
    }
  }

  private isAgentSpawnRequest(input: string): boolean {
    const spawnKeywords = ['spawn', 'create', 'start', 'launch', 'agent']
    return spawnKeywords.some(keyword => 
      input.toLowerCase().includes(keyword)
    )
  }

  private isQuestionRequest(input: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who']
    const lowerInput = input.toLowerCase()
    return questionWords.some(word => lowerInput.startsWith(word)) || 
           input.includes('?')
  }

  private async handleAgentSpawnRequest(input: string): Promise<void> {
    // 提取agent类型和任务
    const agentType = this.extractAgentType(input) || 'general'
    const task = this.extractTask(input) || input
    
    console.log(`🚀 Spawning ${agentType} agent for: ${task}`)
    
    try {
      const taskId = await taskAPI.spawnAgentTask({
        agentType,
        prompt: task,
        description: `User request: ${task}`,
        background: false,
        priority: 'normal'
      })
      
      console.log(`📋 Task created: ${taskId}`)
    } catch (error) {
      console.error('❌ Failed to spawn agent:', error)
    }
  }

  private async handleQuestionRequest(input: string): Promise<void> {
    console.log(`❓ Answering question: ${input}`)
    
    try {
      const taskId = await taskAPI.spawnAgentTask({
        agentType: 'general',
        prompt: input,
        description: `Question: ${input}`,
        background: false,
        priority: 'normal'
      })
      
      console.log(`📋 Task created: ${taskId}`)
    } catch (error) {
      console.error('❌ Failed to answer question:', error)
    }
  }

  private async handleGeneralRequest(input: string): Promise<void> {
    console.log(`🎯 Processing general request: ${input}`)
    
    try {
      const taskId = await taskAPI.spawnAgentTask({
        agentType: 'general',
        prompt: input,
        description: `General request: ${input}`,
        background: false,
        priority: 'normal'
      })
      
      console.log(`📋 Task created: ${taskId}`)
    } catch (error) {
      console.error('❌ Failed to process request:', error)
    }
  }

  private extractAgentType(input: string): string | null {
    const agentTypes = ['researcher', 'coder', 'general', 'analyst']
    const lowerInput = input.toLowerCase()
    
    for (const type of agentTypes) {
      if (lowerInput.includes(type)) {
        return type
      }
    }
    
    return null
  }

  private extractTask(input: string): string | null {
    // 简单的任务提取逻辑
    const taskMarkers = ['to ', 'for ', ': ', 'task: ']
    
    for (const marker of taskMarkers) {
      const index = input.toLowerCase().indexOf(marker)
      if (index !== -1) {
        return input.substring(index + marker.length).trim()
      }
    }
    
    return null
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'killed': return '🚫'
      case 'paused': return '⏸️'
      default: return '❓'
    }
  }
}

// Command implementations
class HelpCommand implements SlashCommand {
  async execute(): Promise<void> {
    console.log('\n📚 Available Commands:')
    console.log('─'.repeat(60))
    console.log('/help                         - Show this help message')
    console.log('/agents                       - List available agents')
    console.log('/spawn <type> <task>          - Spawn an agent task')
    console.log('/shell <command>              - Execute shell command')
    console.log('/tasks                        - List all tasks')
    console.log('/kill <task-id>               - Kill a task')
    console.log('/message <task-id> <msg>      - Send message to agent')
    console.log('/input <task-id> <input>      - Send input to shell task')
    console.log('/background [task-id]         - Background task(s)')
    console.log('/foreground <task-id>         - Foreground task')
    console.log('/notifications                - Show notifications')
    console.log('/coordinator <task>           - Use coordinator mode')
    console.log('/tools                        - List available tools')
    console.log('/status                       - Show system status')
    console.log('/clear                        - Clear screen')
    console.log('/exit                         - Exit terminal')
    console.log('')
    console.log('💡 You can also type natural language requests directly')
    console.log('🔧 Examples:')
    console.log('   "spawn researcher agent to analyze market trends"')
    console.log('   "what is the weather today?"')
    console.log('   "create a python script to sort files"')
    console.log('─'.repeat(60))
    console.log('')
  }
}

class ListAgentsCommand implements SlashCommand {
  constructor(private agentManager: AgentManager) {}

  async execute(): Promise<void> {
    const agents = this.agentManager.getAvailableAgents()
    
    console.log('\n📦 Available Agents:')
    console.log('─'.repeat(50))
    
    if (agents.length === 0) {
      console.log('No agents available')
    } else {
      agents.forEach(agent => {
        const status = agent.background ? '🔄' : '⚡'
        const color = agent.color ? `(${agent.color})` : ''
        console.log(`${status} ${agent.agentType} - ${agent.name} ${color}`)
        console.log(`   ${agent.description}`)
      })
    }
    
    console.log('─'.repeat(50))
    console.log('')
  }
}

class SpawnAgentCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('❌ Usage: /spawn <agent_type> <task_description>')
      return
    }

    const agentType = args[0]
    const task = args.slice(1).join(' ')

    console.log(`🚀 Spawning ${agentType} agent for: ${task}`)

    try {
      const taskId = await taskAPI.spawnAgentTask({
        agentType,
        prompt: task,
        description: task,
        background: false,
        priority: 'normal'
      })

      console.log(`📋 Task created: ${taskId}`)
    } catch (error) {
      console.error('❌ Failed to spawn agent:', error)
    }
  }
}

class ListTasksCommand implements SlashCommand {
  async execute(): Promise<void> {
    const tasks = taskAPI.getAllTasks()
    
    console.log('\n📋 All Tasks:')
    console.log('─'.repeat(80))
    
    if (tasks.length === 0) {
      console.log('No tasks found')
    } else {
      tasks.forEach(task => {
        const icon = this.getTaskIcon(task)
        const duration = this.formatDuration(task)
        console.log(`${icon} ${task.id} - ${task.description}`)
        console.log(`   Type: ${task.type} | Status: ${task.status} | Priority: ${task.priority} | ${duration}`)
        if (task.tags.length > 0) {
          console.log(`   Tags: ${task.tags.join(', ')}`)
        }
      })
    }
    
    console.log('─'.repeat(80))
    
    // 显示统计信息
    const stats = taskAPI.getTaskStats()
    console.log(`📊 Stats: ${stats.overall.total} total, ${stats.overall.running} running, ${stats.overall.background} background`)
    console.log('')
  }

  private getTaskIcon(task: TaskState): string {
    const typeIcons = {
      agent_task: '🤖',
      shell_task: '🐚',
      tool_task: '🔧',
      workflow_task: '📋',
      coordinator_task: '🎯'
    }
    
    const statusIcons = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      killed: '🚫',
      paused: '⏸️'
    }
    
    return `${typeIcons[task.type] || '❓'}${statusIcons[task.status] || '❓'}`
  }

  private formatDuration(task: TaskState): string {
    const endTime = task.endTime || Date.now()
    const duration = endTime - task.startTime
    const seconds = Math.floor(duration / 1000)
    
    if (seconds < 60) {
      return `${seconds}s`
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }
}

class KillTaskCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /kill <task_id>')
      return
    }

    const taskId = args[0]
    
    try {
      await taskAPI.killTask(taskId)
      console.log(`✅ Task ${taskId} killed`)
    } catch (error) {
      console.log(`❌ Failed to kill task ${taskId}: ${error}`)
    }
  }
}

class SendMessageCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('❌ Usage: /message <task_id> <message>')
      return
    }

    const taskId = args[0]
    const message = args.slice(1).join(' ')

    try {
      await taskAPI.sendMessageToAgent(taskId, message)
      console.log(`📨 Message sent to ${taskId}: ${message}`)
    } catch (error) {
      console.log(`❌ Failed to send message: ${error}`)
    }
  }
}

class SendInputCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('❌ Usage: /input <task_id> <input>')
      return
    }

    const taskId = args[0]
    const input = args.slice(1).join(' ')

    try {
      await taskAPI.sendInputToShell(taskId, input)
      console.log(`⌨️  Input sent to ${taskId}: ${input}`)
    } catch (error) {
      console.log(`❌ Failed to send input: ${error}`)
    }
  }
}

class BackgroundTaskCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      // 后台化所有前台任务
      await taskAPI.backgroundAllTasks()
      console.log('✅ All foreground tasks backgrounded')
    } else {
      // 后台化指定任务
      const taskId = args[0]
      try {
        const success = await taskAPI.backgroundTask(taskId)
        if (success) {
          console.log(`✅ Task ${taskId} backgrounded`)
        } else {
          console.log(`❌ Failed to background task ${taskId}`)
        }
      } catch (error) {
        console.log(`❌ Error: ${error}`)
      }
    }
  }
}

class ForegroundTaskCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /foreground <task_id>')
      return
    }

    const taskId = args[0]
    try {
      const success = await taskAPI.foregroundTask(taskId)
      if (success) {
        console.log(`✅ Task ${taskId} foregrounded`)
      } else {
        console.log(`❌ Failed to foreground task ${taskId}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`)
    }
  }
}

class ShellCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /shell <command>')
      return
    }

    const command = args.join(' ')
    console.log(`🐚 Executing shell command: ${command}`)

    try {
      const taskId = await taskAPI.spawnShellTask({
        command,
        description: `Shell: ${command}`,
        background: false,
        priority: 'normal',
        shell: true
      })

      console.log(`📋 Shell task created: ${taskId}`)
    } catch (error) {
      console.error('❌ Failed to execute shell command:', error)
    }
  }
}

class NotificationsCommand implements SlashCommand {
  async execute(): Promise<void> {
    const notifications = taskAPI.getNotifications()
    
    console.log('\n🔔 Notifications:')
    console.log('─'.repeat(50))
    
    if (notifications.length === 0) {
      console.log('No notifications')
    } else {
      notifications.forEach(notification => {
        const icon = this.getStatusIcon(notification.status)
        const priority = notification.priority === 'high' ? '🔴' : 
                        notification.priority === 'low' ? '🟢' : '🟡'
        console.log(`${icon}${priority} ${notification.summary}`)
        if (notification.outputFile) {
          console.log(`   Output: ${notification.outputFile}`)
        }
      })
      
      console.log('')
      console.log('Use /clear-notifications to clear all notifications')
    }
    
    console.log('─'.repeat(50))
    console.log('')
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'killed': return '🚫'
      default: return '📢'
    }
  }
}

class CoordinatorCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /coordinator <complex_task>')
      return
    }

    const task = args.join(' ')
    console.log(`🎯 Coordinator mode: ${task}`)
    // TODO: Implement coordinator mode
  }
}

class ListToolsCommand implements SlashCommand {
  constructor(private toolExecutor: ToolExecutor | null) {}

  async execute(): Promise<void> {
    console.log('\n🔧 Available Tools:')
    console.log('─'.repeat(50))
    
    if (!this.toolExecutor) {
      console.log('Tool executor not initialized')
    } else {
      const tools = this.toolExecutor.getAvailableTools()
      tools.forEach(tool => {
        console.log(`🔧 ${tool.name} - ${tool.searchHint || 'No description'}`)
      })
    }
    
    console.log('─'.repeat(50))
    console.log('')
  }
}

class StatusCommand implements SlashCommand {
  async execute(): Promise<void> {
    const stats = taskAPI.getTaskStats()
    const notifications = taskAPI.getNotifications()
    
    console.log('\n📊 System Status:')
    console.log('─'.repeat(50))
    console.log(`Tasks: ${stats.overall.total} total, ${stats.overall.running} running, ${stats.overall.background} background`)
    console.log(`Agent Tasks: ${stats.agent.total} total, ${stats.agent.running} running`)
    console.log(`Shell Tasks: ${stats.shell.total} total, ${stats.shell.running} running`)
    console.log(`Notifications: ${notifications.length} pending`)
    console.log(`Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)
    console.log(`Uptime: ${Math.round(process.uptime())}s`)
    console.log('─'.repeat(50))
    console.log('')
  }
}

class ClearCommand implements SlashCommand {
  async execute(): Promise<void> {
    console.clear()
    console.log('🤖 Skill-Router Agent Terminal')
    console.log('===============================')
    console.log('')
  }
}