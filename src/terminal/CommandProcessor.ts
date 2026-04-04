import { AgentManager } from '../agents/AgentManager.js'
import { ToolExecutor } from '../tools/ToolExecutor.js'
import { taskAPI, TaskState } from '../tasks/TaskAPI.js'
import type { OpenAIConfig } from '../handler.js'

export interface SlashCommand {
  execute(args: string[]): Promise<void>
}

export class CommandProcessor {
  private agentManager: AgentManager
  protected toolExecutor: ToolExecutor | null = null
  private availableCommands: Map<string, SlashCommand> = new Map()

  getToolExecutor(): ToolExecutor | null {
    return this.toolExecutor
  }

  constructor() {
    this.agentManager = AgentManager.getInstance()
    // 尝试从环境变量初始化ToolExecutor
    this.tryInitializeToolExecutorFromEnv()
    this.setupCommands()
    this.setupTaskEventListeners()
  }

  setConfig(config: OpenAIConfig): void {
    this.toolExecutor = new ToolExecutor(config)
    // 重新设置命令，确保ListToolsCommand使用新的toolExecutor
    this.setupCommands()
  }

  private tryInitializeToolExecutorFromEnv(): void {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
    const baseUrl = String(process.env.OPENAI_BASE_URL || "").trim()
    const model = String(process.env.OPENAI_MODEL || "").trim()
    
    if (apiKey && baseUrl && model) {
      const config: OpenAIConfig = {
        apiKey,
        baseUrl,
        model
      }
      this.toolExecutor = new ToolExecutor(config)
      console.log('✅ ToolExecutor initialized from environment variables')
    } else {
      console.warn('⚠️  ToolExecutor not initialized - missing OpenAI configuration in environment variables')
    }
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
      ['/todo', new TodoCommand()],
      ['/todos', new TodoListCommand()],
      ['/plan', new PlanCommand()],
      ['/metrics', new MetricsCommand(this)],
      ['/audit', new AuditCommand(this)],
      ['/cache', new CacheCommand(this)],
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
    console.log('/todo <action> [params]        - Manage todo items (add, status, delete, clear)')
    console.log('/todos                        - List all todo items')
    console.log('/plan <task>                  - Create a plan with todo steps')
    console.log('/metrics [show|clear]          - Show tool execution metrics')
    console.log('/audit [show|clear] [limit]   - Show audit logs')
    console.log('/cache [show|clear]           - Manage tool result cache')
    console.log('/exit                         - Exit terminal')
    console.log('')
    console.log('💡 You can also type natural language requests directly')
    console.log('🔧 Examples:')
    console.log('   "spawn researcher agent to analyze market trends"')
    console.log('   "what is the weather today?"')
    console.log('   "create a python script to sort files"')
    console.log('   /todo add "Implement feature X" high')
    console.log('   /plan "Build a web application"')
    console.log('   /metrics - Show tool execution statistics')
    console.log('   /audit 10 - Show last 10 audit logs')
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

class TodoCommand implements SlashCommand {
  private todoStore: any = null

  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /todo <action> [parameters]')
      console.log('   Actions: add, update, status, delete, clear')
      console.log('   Examples:')
      console.log('     /todo add "Implement feature X" high')
      console.log('     /todo status <id> completed')
      console.log('     /todo delete <id>')
      console.log('     /todo clear')
      return
    }

    if (!this.todoStore) {
      const { TodoWriteTool } = await import('../tools/TodoWriteTool.js')
      this.todoStore = (TodoWriteTool as any).todoStore
    }

    const action = args[0]
    const todoStore = this.todoStore

    try {
      switch (action) {
        case 'add':
          if (args.length < 2) {
            console.log('❌ Usage: /todo add "<content>" [priority]')
            return
          }
          const content = args[1]
          const priority = (args[2] as 'low' | 'medium' | 'high') || 'medium'
          const newTodo = todoStore.addTodo(undefined, content, priority)
          console.log(`✅ Added todo: ${content} (ID: ${newTodo.id})`)
          break

        case 'status':
          if (args.length < 3) {
            console.log('❌ Usage: /todo status <id> <status>')
            console.log('   Status: pending, in_progress, completed')
            return
          }
          const statusId = args[1]
          const status = args[2] as 'pending' | 'in_progress' | 'completed'
          const updated = todoStore.updateTodoStatus(undefined, statusId, status)
          if (updated) {
            console.log(`✅ Updated todo ${statusId} status to ${status}`)
          } else {
            console.log(`❌ Todo ${statusId} not found`)
          }
          break

        case 'delete':
          if (args.length < 2) {
            console.log('❌ Usage: /todo delete <id>')
            return
          }
          const deleteId = args[1]
          const deleted = todoStore.deleteTodo(undefined, deleteId)
          if (deleted) {
            console.log(`✅ Deleted todo ${deleteId}`)
          } else {
            console.log(`❌ Todo ${deleteId} not found`)
          }
          break

        case 'clear':
          todoStore.clearTodos(undefined)
          console.log('✅ Cleared all todos')
          break

        default:
          console.log(`❌ Unknown action: ${action}`)
      }
    } catch (error) {
      console.error('❌ Error:', error)
    }
  }
}

class TodoListCommand implements SlashCommand {
  private todoStore: any = null

  async execute(): Promise<void> {
    if (!this.todoStore) {
      const { TodoWriteTool } = await import('../tools/TodoWriteTool.js')
      this.todoStore = (TodoWriteTool as any).todoStore
    }

    const todos = this.todoStore.getTodos(undefined)

    console.log('\n📋 Todo List:')
    console.log('─'.repeat(80))

    if (todos.length === 0) {
      console.log('No todos found. Use /todo add to create one.')
    } else {
      const statusIcons = {
        pending: '⏳',
        in_progress: '🔄',
        completed: '✅',
      }
      const priorityIcons = {
        low: '🟢',
        medium: '🟡',
        high: '🔴',
      }

      todos.forEach((todo: any) => {
        const icon = statusIcons[todo.status as keyof typeof statusIcons]
        const priorityIcon = priorityIcons[todo.priority as keyof typeof priorityIcons]
        console.log(`${icon}${priorityIcon} [${todo.id}] ${todo.content}`)
      })

      console.log('\n📊 Stats:')
      const pending = todos.filter((t: any) => t.status === 'pending').length
      const inProgress = todos.filter((t: any) => t.status === 'in_progress').length
      const completed = todos.filter((t: any) => t.status === 'completed').length
      console.log(`   Pending: ${pending} | In Progress: ${inProgress} | Completed: ${completed}`)
    }

    console.log('─'.repeat(80))
    console.log('')
  }
}

class PlanCommand implements SlashCommand {
  async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('❌ Usage: /plan <complex_task_description>')
      console.log('   This will create a plan using todo items')
      return
    }

    const task = args.join(' ')
    console.log(`🎯 Creating plan for: ${task}`)
    console.log('')

    try {
      const { TodoWriteTool } = await import('../tools/TodoWriteTool.js')
      const todoStore = (TodoWriteTool as any).todoStore

      const steps = [
        `1. Analyze and understand the task: ${task}`,
        '2. Break down into smaller subtasks',
        '3. Implement the solution',
        '4. Test and verify',
        '5. Document the results',
      ]

      console.log('📋 Plan steps:')
      steps.forEach((step, index) => {
        const todo = todoStore.addTodo(undefined, step, index === 0 ? 'high' : 'medium')
        console.log(`   ${index + 1}. ${step} (ID: ${todo.id})`)
      })

      console.log('')
      console.log('✅ Plan created! Use /todos to view, /todo status <id> in_progress to start working')
      console.log('')
    } catch (error) {
      console.error('❌ Error creating plan:', error)
    }
  }
}

class MetricsCommand implements SlashCommand {
  constructor(private commandProcessor: CommandProcessor) {}

  async execute(args: string[]): Promise<void> {
    const executor = this.commandProcessor.getToolExecutor()
    if (!executor) {
      console.log('❌ ToolExecutor not initialized')
      return
    }

    const action = args[0] || 'show'

    switch (action) {
      case 'show':
      case 'list':
        this.showMetrics(executor)
        break
      case 'clear':
      case 'reset':
        executor.clearMetrics()
        console.log('✅ Metrics cleared')
        break
      default:
        console.log('❌ Usage: /metrics [show|clear]')
    }
  }

  private showMetrics(executor: any): void {
    const { global, byTool } = executor.getMetrics()

    console.log('\n📊 Tool Execution Metrics:')
    console.log('─'.repeat(80))

    console.log('\n📈 Global Metrics:')
    console.log(`   Total Calls: ${global.totalCalls}`)
    console.log(`   Successful: ${global.successfulCalls} (${global.totalCalls > 0 ? Math.round(global.successfulCalls / global.totalCalls * 100) : 0}%)`)
    console.log(`   Failed: ${global.failedCalls}`)
    console.log(`   Average Duration: ${Math.round(global.avgDurationMs)}ms`)
    console.log(`   Total Duration: ${Math.round(global.totalDurationMs / 1000)}s`)
    console.log(`   Retries: ${global.retries}`)
    console.log(`   Cache Hits: ${global.cacheHits}`)
    console.log(`   Cache Misses: ${global.cacheMisses}`)
    console.log(`   Hit Rate: ${global.cacheHits + global.cacheMisses > 0 ? Math.round(global.cacheHits / (global.cacheHits + global.cacheMisses) * 100) : 0}%`)

    if (byTool.size > 0) {
      console.log('\n🔧 Per-Tool Metrics:')
      for (const [toolName, metrics] of byTool) {
        console.log(`\n   📌 ${toolName}:`)
        console.log(`      Calls: ${metrics.totalCalls} | Success: ${metrics.successfulCalls} | Failed: ${metrics.failedCalls}`)
        console.log(`      Avg: ${Math.round(metrics.avgDurationMs)}ms | Total: ${Math.round(metrics.totalDurationMs / 1000)}s`)
        if (metrics.cacheHits > 0 || metrics.cacheMisses > 0) {
          console.log(`      Cache: ${metrics.cacheHits} hits / ${metrics.cacheMisses} misses`)
        }
      }
    }

    console.log('\n─'.repeat(80))
    console.log('')
  }
}

class AuditCommand implements SlashCommand {
  constructor(private commandProcessor: CommandProcessor) {}

  async execute(args: string[]): Promise<void> {
    const executor = this.commandProcessor.getToolExecutor()
    if (!executor) {
      console.log('❌ ToolExecutor not initialized')
      return
    }

    const action = args[0] || 'show'
    const limit = args[1] ? parseInt(args[1]) : 10

    switch (action) {
      case 'show':
      case 'list':
        this.showAuditLogs(executor, limit)
        break
      case 'clear':
        executor.clearAuditLogs()
        console.log('✅ Audit logs cleared')
        break
      default:
        console.log('❌ Usage: /audit [show|clear] [limit]')
    }
  }

  private showAuditLogs(executor: any, limit: number): void {
    const logs = executor.getAuditLogs(limit)

    console.log('\n📜 Audit Logs:')
    console.log('─'.repeat(80))

    if (logs.length === 0) {
      console.log('No audit logs found')
    } else {
      const statusIcons = {
        success: '✅',
        error: '❌',
        cached: '💾',
      }

      logs.forEach((log: any) => {
        const icon = statusIcons[log.status as keyof typeof statusIcons] || '❓'
        const time = new Date(log.timestamp).toLocaleTimeString()
        console.log(`${icon} [${time}] ${log.toolName}`)
        console.log(`   ID: ${log.toolCallId} | Duration: ${log.durationMs}ms`)
        if (log.retryCount > 0) {
          console.log(`   Retries: ${log.retryCount}`)
        }
        if (log.error) {
          console.log(`   Error: ${log.error}`)
        }
        console.log('')
      })
    }

    console.log('─'.repeat(80))
    console.log('')
  }
}

class CacheCommand implements SlashCommand {
  constructor(private commandProcessor: CommandProcessor) {}

  async execute(args: string[]): Promise<void> {
    const executor = this.commandProcessor.getToolExecutor()
    if (!executor) {
      console.log('❌ ToolExecutor not initialized')
      return
    }

    const action = args[0] || 'show'

    switch (action) {
      case 'show':
      case 'status':
        this.showCacheStatus(executor)
        break
      case 'clear':
        executor.clearCache()
        console.log('✅ Cache cleared')
        break
      default:
        console.log('❌ Usage: /cache [show|clear]')
    }
  }

  private showCacheStatus(executor: any): void {
    const metrics = executor.getMetrics()
    const cacheSize = (executor as any).cache?.size() || 0

    console.log('\n💾 Cache Status:')
    console.log('─'.repeat(80))
    console.log(`   Entries: ${cacheSize}`)
    console.log(`   Hits: ${metrics.global.cacheHits}`)
    console.log(`   Misses: ${metrics.global.cacheMisses}`)
    const hitRate = metrics.global.cacheHits + metrics.global.cacheMisses > 0
      ? Math.round(metrics.global.cacheHits / (metrics.global.cacheHits + metrics.global.cacheMisses) * 100)
      : 0
    console.log(`   Hit Rate: ${hitRate}%`)
    console.log('─'.repeat(80))
    console.log('')
  }
}