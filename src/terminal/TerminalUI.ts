import { createInterface } from 'readline'

export interface ProgressUpdate {
  stage: string
  message: string
  data?: any
}

export class TerminalUI {
  private commandProcessor: any = null
  private progressTracker: any = null
  private isInteractive = false
  private rl: any

  async startInteractiveMode(config?: { apiKey: string; baseUrl: string; model: string }): Promise<void> {
    // 直接导入，避免循环依赖问题
    if (!this.commandProcessor) {
      const { CommandProcessor } = await import('./CommandProcessor.js')
      this.commandProcessor = new CommandProcessor()
      
      // Set config if provided
      if (config && config.apiKey && config.baseUrl && config.model) {
        this.commandProcessor.setConfig({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model
        })
      }
    }
    
    if (!this.progressTracker) {
      const { ProgressTracker } = await import('./ProgressTracker.js')
      this.progressTracker = new ProgressTracker()
    }
    
    this.isInteractive = true
    
    console.log('🤖 Skill-Router Agent Terminal')
    console.log('===============================')
    console.log('Type /help for available commands, /exit to quit')
    console.log('')

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    })

    this.rl.prompt()

    this.rl.on('line', async (input: string) => {
      const command = input.trim()

      if (command === '/exit' || command === '/quit') {
        this.rl.close()
        return
      }

      if (!command) {
        this.rl.prompt()
        return
      }

      try {
        await this.processCommand(command)
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error)
      }

      this.rl.prompt()
    })

    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!')
      process.exit(0)
    })

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n\n👋 Goodbye!')
      process.exit(0)
    })
  }

  private async processCommand(command: string): Promise<void> {
    if (!this.commandProcessor) {
      console.error('Command processor not initialized')
      return
    }
    
    if (command.startsWith('/')) {
      await this.commandProcessor.processSlashCommand(command)
    } else {
      await this.commandProcessor.processNaturalLanguage(command)
    }
  }

  displayProgress(progress: ProgressUpdate): void {
    const { stage, message, data } = progress

    switch (stage) {
      case 'agent_start':
        console.log(`🚀 Starting agent: ${data?.description || 'Unknown task'}`)
        break
      case 'agent_progress':
        console.log(`⏳ ${message}`)
        break
      case 'agent_complete':
        console.log(`✅ Agent completed: ${data?.result || 'Success'}`)
        break
      case 'tool_start':
        console.log(`🔧 Using tool: ${data?.toolName}`)
        break
      case 'tool_progress':
        console.log(`   ${message}`)
        break
      case 'tool_complete':
        console.log(`✅ Tool completed: ${data?.toolName}`)
        break
      case 'coordinator_start':
        console.log(`🎯 Coordinator mode: ${message}`)
        break
      case 'worker_spawn':
        console.log(`👷 Spawning worker: ${data?.name || 'Unknown'}`)
        break
      case 'worker_complete':
        console.log(`✅ Worker completed: ${data?.name || 'Unknown'}`)
        break
      case 'synthesis':
        console.log(`🧠 Synthesizing results...`)
        break
      default:
        console.log(`ℹ️  ${message}`)
    }
  }

  displayResult(result: string): void {
    console.log('\n📋 Result:')
    console.log('─'.repeat(50))
    console.log(result)
    console.log('─'.repeat(50))
    console.log('')
  }

  displayError(error: string): void {
    console.log(`\n❌ Error: ${error}\n`)
  }

  displayAgentList(agents: any[]): void {
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

  displayTaskList(tasks: any[]): void {
    console.log('\n📋 Running Tasks:')
    console.log('─'.repeat(50))
    
    if (tasks.length === 0) {
      console.log('No running tasks')
    } else {
      tasks.forEach(task => {
        const status = this.getTaskStatusIcon(task.status)
        console.log(`${status} ${task.id} - ${task.description}`)
        console.log(`   Status: ${task.status}`)
        if (task.progress) {
          console.log(`   Progress: ${task.progress.message}`)
        }
      })
    }
    
    console.log('─'.repeat(50))
    console.log('')
  }

  private getTaskStatusIcon(status: string): string {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'cancelled': return '🚫'
      default: return '❓'
    }
  }

  displayHelp(): void {
    console.log('\n📚 Available Commands:')
    console.log('─'.repeat(50))
    console.log('/help                    - Show this help message')
    console.log('/agents                  - List available agents')
    console.log('/spawn <type> <task>     - Spawn an agent')
    console.log('/tasks                   - List running tasks')
    console.log('/kill <task-id>          - Kill a running task')
    console.log('/message <id> <msg>      - Send message to agent')
    console.log('/coordinator <task>      - Use coordinator mode')
    console.log('/tools                   - List available tools')
    console.log('/status                  - Show system status')
    console.log('/clear                   - Clear screen')
    console.log('/exit                    - Exit terminal')
    console.log('')
    console.log('💡 You can also type natural language requests directly')
    console.log('─'.repeat(50))
    console.log('')
  }

  clearScreen(): void {
    console.clear()
    console.log('🤖 Skill-Router Agent Terminal')
    console.log('===============================')
    console.log('')
  }

  close(): void {
    if (this.rl) {
      this.rl.close()
    }
  }
}