import { z } from 'zod'
import { spawn } from 'child_process'
import { buildTool, type ToolDef } from './Tool.js'

const inputSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  cwd: z.string().optional().describe('Working directory for the command'),
  timeout: z.number().int().min(1).max(300).default(30).describe('Timeout in seconds'),
  env: z.record(z.string()).optional().describe('Environment variables'),
})

const outputSchema = z.object({
  stdout: z.string().describe('Standard output'),
  stderr: z.string().describe('Standard error'),
  exitCode: z.number().describe('Exit code'),
  command: z.string().describe('Command that was executed'),
  duration: z.number().describe('Execution duration in milliseconds'),
})

export type BashInput = z.infer<typeof inputSchema>
export type BashOutput = z.infer<typeof outputSchema>

export type BashProgress = {
  type: 'command_start' | 'stdout_data' | 'stderr_data' | 'command_complete'
  command?: string
  data?: string
  exitCode?: number
}

// Dangerous commands that should be blocked
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf *',
  'dd if=/dev/zero',
  'mkfs',
  'fdisk',
  'format',
  'del /s /q',
  'rmdir /s /q',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6',
]

function isDangerousCommand(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false // Default to not dangerous if command is not provided
  }
  const cmd = command.toLowerCase().trim()
  return DANGEROUS_COMMANDS.some(dangerous => cmd.includes(dangerous.toLowerCase()))
}

function executeCommand(
  command: string,
  options: {
    cwd?: string
    timeout?: number
    env?: Record<string, string>
  },
  onProgress?: (progress: BashProgress) => void,
  signal?: AbortSignal
): Promise<BashOutput> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    
    onProgress?.({
      type: 'command_start',
      command,
    })
    
    // Determine shell based on platform
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd' : 'bash'
    const shellArgs = isWindows ? ['/c'] : ['-c']
    
    const child = spawn(shell, [...shellArgs, command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    
    let stdout = ''
    let stderr = ''
    let finished = false
    
    // Set up timeout
    const timeoutMs = (options.timeout || 30) * 1000
    const timeoutId = setTimeout(() => {
      if (!finished) {
        finished = true
        child.kill('SIGTERM')
        reject(new Error(`Command timed out after ${options.timeout} seconds`))
      }
    }, timeoutMs)
    
    // Handle abort signal
    const abortHandler = () => {
      if (!finished) {
        finished = true
        clearTimeout(timeoutId)
        child.kill('SIGTERM')
        reject(new Error('Command aborted'))
      }
    }
    
    signal?.addEventListener('abort', abortHandler)
    
    // Collect stdout
    child.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      onProgress?.({
        type: 'stdout_data',
        data: chunk,
      })
    })
    
    // Collect stderr
    child.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      onProgress?.({
        type: 'stderr_data',
        data: chunk,
      })
    })
    
    // Handle process completion
    child.on('close', (exitCode) => {
      if (!finished) {
        finished = true
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)
        
        const duration = Date.now() - startTime
        
        onProgress?.({
          type: 'command_complete',
          command,
          exitCode: exitCode || 0,
        })
        
        resolve({
          stdout,
          stderr,
          exitCode: exitCode || 0,
          command,
          duration,
        })
      }
    })
    
    // Handle process errors
    child.on('error', (error) => {
      if (!finished) {
        finished = true
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)
        reject(error)
      }
    })
  })
}

export const BashTool = buildTool({
  name: 'bash',
  searchHint: 'execute shell commands and scripts',
  maxResultSizeChars: 100_000,
  
  async description(input) {
    return `Execute command: ${input.command}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return false // Command execution is not safe for concurrent execution
  },
  
  isReadOnly(input) {
    // Simple heuristic to determine if command is read-only
    if (!input || !input.command || typeof input.command !== 'string') {
      return false // Default to not read-only if command is not provided
    }
    
    const readOnlyCommands = ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'echo', 'pwd', 'which', 'ps', 'top', 'df', 'du']
    const cmd = input.command.toLowerCase().trim().split(/\s+/)[0]
    return readOnlyCommands.includes(cmd)
  },
  
  isDestructive(input) {
    if (!input || !input.command || typeof input.command !== 'string') {
      return false // Default to not destructive if command is not provided
    }
    return isDangerousCommand(input.command)
  },
  
  userFacingName() {
    return 'Bash'
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
    return summary ? `Running ${summary}` : 'Running command'
  },
  
  async checkPermissions(input) {
    const { command } = input
    
    if (isDangerousCommand(command)) {
      return {
        behavior: 'deny',
        message: `Dangerous command blocked: ${command}`,
      }
    }
    
    if (this.isReadOnly?.(input)) {
      return {
        behavior: 'allow',
        updatedInput: input,
      }
    }
    
    return {
      behavior: 'ask',
      message: `Allow executing command: ${command}?`,
      suggestions: [
        {
          type: 'allow_once',
          label: 'Allow once',
        },
        {
          type: 'allow_similar',
          label: 'Allow similar commands',
        },
      ],
    }
  },
  
  async validateInput(input) {
    const { command, timeout } = input
    
    if (!command || typeof command !== 'string' || !command.trim()) {
      return {
        result: false,
        message: 'Command cannot be empty',
        errorCode: 1,
      }
    }
    
    if (timeout && (timeout < 1 || timeout > 300)) {
      return {
        result: false,
        message: 'Timeout must be between 1 and 300 seconds',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call({ command, cwd, timeout, env }, context, onProgress) {
    try {
      const result = await executeCommand(
        command,
        { cwd, timeout, env },
        onProgress ? (progress) => {
          onProgress({
            toolUseID: 'bash-command',
            data: progress,
          })
        } : undefined,
        context.abortController.signal
      )
      
      return { data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: BashOutput = {
        stdout: '',
        stderr: message,
        exitCode: -1,
        command,
        duration: 0,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, BashOutput, BashProgress>)