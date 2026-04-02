import { createInterface } from 'readline'
import { marked } from 'marked'
import hljs from 'highlight.js'

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

  constructor() {
    // 配置marked使用highlight.js进行代码高亮
    marked.setOptions({
      breaks: true,
      gfm: true
    })
  }

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
    
    // 检查是否包含markdown内容
    if (this.containsMarkdown(result)) {
      // 渲染markdown为终端友好的格式
      const rendered = this.renderMarkdownForTerminal(result)
      console.log(rendered)
    } else {
      // 直接显示纯文本
      console.log(result)
    }
    
    console.log('─'.repeat(50))
    console.log('')
  }

  private containsMarkdown(text: string): boolean {
    // 检查常见的markdown标记
    const markdownPatterns = [
      /^#{1,6}\s/, // 标题
      /^-\s/, // 无序列表
      /^\d+\.\s/, // 有序列表
      /```[\s\S]*?```/, // 代码块
      /\*\*[\s\S]*?\*\*/, // 粗体
      /\*[\s\S]*?\*/, // 斜体
      /\[.*?\]\(.*?\)/, // 链接
      /!\[.*?\]\(.*?\)/, // 图片
      /^>\s/ // 引用
    ]
    
    return markdownPatterns.some(pattern => pattern.test(text))
  }

  private renderMarkdownForTerminal(markdown: string): string {
    // 简单的markdown到终端文本的转换
    let result = markdown
    
    // 处理标题
    result = result.replace(/^(#{1,6})\s(.*)$/gm, (match, hashes, text) => {
      const level = hashes.length
      const indent = '  '.repeat(level - 1)
      const symbol = '#' .repeat(level)
      return `${indent}${symbol} ${text}`
    })
    
    // 处理无序列表
    result = result.replace(/^-\s(.*)$/gm, '  • $1')
    
    // 处理有序列表
    result = result.replace(/^(\d+)\.\s(.*)$/gm, '  $1. $2')
    
    // 处理粗体
    result = result.replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m')
    
    // 处理斜体
    result = result.replace(/\*(.*?)\*/g, '\x1b[3m$1\x1b[0m')
    
    // 处理代码块
    result = result.replace(/```(\w*)\n([\s\S]*?)```/gm, (match: string, lang: string, code: string) => {
      const language = lang || 'plaintext'
      const lines = code.split('\n')
      const indentedCode = lines.map((line: string) => `    ${line}`).join('\n')
      return `\n📄 ${language} code:\n${indentedCode}\n`
    })
    
    // 处理行内代码
    result = result.replace(/`(.*?)`/g, '\x1b[36m$1\x1b[0m')
    
    // 处理引用
    result = result.replace(/^>\s(.*)$/gm, '  > $1')
    
    // 处理链接
    result = result.replace(/\[(.*?)\]\((.*?)\)/g, '$1 (链接: $2)')
    
    // 处理图片
    result = result.replace(/!\[(.*?)\]\((.*?)\)/g, '📷 $1 (图片: $2)')
    
    return result
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