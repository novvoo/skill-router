import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { terminalManager } from './TerminalManager.js'

const inputSchema = z.object({
  command: z.string().describe('The command to execute in the terminal'),
  wait_ms: z.number().int().min(100).max(10000).default(2000).describe('Time to wait for command to complete (ms)'),
  clear_buffer: z.boolean().default(false).describe('Clear terminal buffer before execution'),
})

const outputSchema = z.object({
  stdout: z.string().describe('Standard output'),
  stderr: z.string().describe('Standard error'),
  command: z.string().describe('Command that was executed'),
  duration: z.number().describe('Execution duration in milliseconds'),
})

export type TerminalInput = z.infer<typeof inputSchema>
export type TerminalOutput = z.infer<typeof outputSchema>

export type TerminalProgress = {
  type: 'command_start' | 'command_output' | 'command_complete'
  command?: string
  output?: string
}

export const TerminalTool = buildTool({
  name: 'terminal',
  searchHint: 'execute commands in a persistent terminal session',
  maxResultSizeChars: 100_000,
  
  async description(input) {
    return `Execute command in terminal: ${input.command}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return false // Terminal commands should be executed sequentially
  },
  
  isReadOnly(input) {
    // Simple heuristic to determine if command is read-only
    if (!input || !input.command || typeof input.command !== 'string') {
      return false
    }
    
    const readOnlyCommands = ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'echo', 'pwd', 'which', 'ps', 'top', 'df', 'du']
    const cmd = input.command.toLowerCase().trim().split(/\s+/)[0]
    return readOnlyCommands.includes(cmd)
  },
  
  userFacingName() {
    return 'Terminal'
  },
  
  getToolUseSummary(input) {
    if (!input?.command) return null
    // Return first 50 characters of command
    return input.command.length > 50 
      ? input.command.substring(0, 47) + '...'
      : input.command
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Running ${summary} in terminal` : 'Running terminal command'
  },
  
  async validateInput(input) {
    const { command } = input
    
    if (!command || typeof command !== 'string' || !command.trim()) {
      return {
        result: false,
        message: 'Command cannot be empty',
        errorCode: 1,
      }
    }
    
    return { result: true }
  },
  
  async call({ command, wait_ms, clear_buffer }, context, onProgress) {
    try {
      const startTime = Date.now()
      
      onProgress?.({
        toolUseID: 'terminal-command',
        data: {
          type: 'command_start',
          command,
        },
      })
      
      const terminal = terminalManager.getTerminal()
      
      // Clear buffer if requested
      if (clear_buffer) {
        terminal.clearBuffer()
      }
      
      // Execute command and wait for completion
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve) => {
        let stdout = ''
        let stderr = ''
        
        const stdoutListener = (data: string) => {
          stdout += data
          onProgress?.({
            toolUseID: 'terminal-command',
            data: {
              type: 'command_output',
              output: data,
            },
          })
        }
        
        const stderrListener = (data: string) => {
          stderr += data
          onProgress?.({
            toolUseID: 'terminal-command',
            data: {
              type: 'command_output',
              output: data,
            },
          })
        }
        
        terminal.on('stdout', stdoutListener)
        terminal.on('stderr', stderrListener)
        
        // Execute command
        terminal.write(command)
        
        // Wait for command to complete
        setTimeout(() => {
          terminal.off('stdout', stdoutListener)
          terminal.off('stderr', stderrListener)
          resolve({ stdout, stderr })
        }, wait_ms)
      })
      
      const duration = Date.now() - startTime
      
      onProgress?.({
        toolUseID: 'terminal-command',
        data: {
          type: 'command_complete',
          command,
        },
      })
      
      const output: TerminalOutput = {
        stdout,
        stderr,
        command,
        duration,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: TerminalOutput = {
        stdout: '',
        stderr: message,
        command,
        duration: 0,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, TerminalOutput, TerminalProgress>)
