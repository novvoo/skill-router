import { spawn } from 'child_process'

class TerminalInstance {
  private process: ReturnType<typeof spawn>
  private stdoutBuffer: string = ''
  private stderrBuffer: string = ''
  private listeners: Map<string, ((data: string) => void)[]> = new Map()
  private isRunning: boolean = true

  constructor() {
    // Create a persistent terminal process
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'powershell' : 'bash'
    const shellArgs = isWindows ? [] : ['-i']

    this.process = spawn(shell, shellArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      cwd: process.cwd(),
      windowsVerbatimArguments: isWindows,
    })

    // Collect output
    this.process.stdout?.on('data', (data) => {
      const chunk = data.toString()
      this.stdoutBuffer += chunk
      this.notifyListeners('stdout', chunk)
    })

    this.process.stderr?.on('data', (data) => {
      const chunk = data.toString()
      this.stderrBuffer += chunk
      this.notifyListeners('stderr', chunk)
    })

    this.process.on('close', () => {
      this.isRunning = false
      this.notifyListeners('close', '')
    })

    this.process.on('error', (error) => {
      this.notifyListeners('error', error.message)
    })
  }

  private notifyListeners(event: string, data: string) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data))
    }
  }

  on(event: 'stdout' | 'stderr' | 'close' | 'error', listener: (data: string) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)?.push(listener)
  }

  off(event: 'stdout' | 'stderr' | 'close' | 'error', listener: (data: string) => void) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      this.listeners.set(event, eventListeners.filter(l => l !== listener))
    }
  }

  write(command: string) {
    if (this.isRunning && this.process.stdin) {
      this.process.stdin.write(command + '\n')
    }
  }

  getBuffer() {
    return {
      stdout: this.stdoutBuffer,
      stderr: this.stderrBuffer
    }
  }

  clearBuffer() {
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
  }

  close() {
    if (this.isRunning) {
      this.process.kill()
      this.isRunning = false
    }
  }

  isAlive() {
    return this.isRunning
  }
}

export class TerminalManager {
  private static instance: TerminalManager
  private terminal: TerminalInstance | null = null

  private constructor() {}

  static getInstance(): TerminalManager {
    if (!TerminalManager.instance) {
      TerminalManager.instance = new TerminalManager()
    }
    return TerminalManager.instance
  }

  getTerminal(): TerminalInstance {
    if (!this.terminal || !this.terminal.isAlive()) {
      this.terminal = new TerminalInstance()
      console.log('📱 Created new terminal instance')
    }
    return this.terminal
  }

  closeTerminal() {
    if (this.terminal) {
      this.terminal.close()
      this.terminal = null
      console.log('📱 Closed terminal instance')
    }
  }

  executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const terminal = this.getTerminal()
      const startTime = Date.now()
      const timeout = 30000 // 30 seconds timeout

      let stdout = ''
      let stderr = ''

      const stdoutListener = (data: string) => {
        stdout += data
      }

      const stderrListener = (data: string) => {
        stderr += data
      }

      const timeoutId = setTimeout(() => {
        terminal.off('stdout', stdoutListener)
        terminal.off('stderr', stderrListener)
        resolve({ stdout, stderr: stderr || 'Command timed out' })
      }, timeout)

      // Wait for command prompt before executing
      setTimeout(() => {
        terminal.on('stdout', stdoutListener)
        terminal.on('stderr', stderrListener)

        // Execute command
        terminal.write(command)

        // Wait a bit for command to complete
        setTimeout(() => {
          clearTimeout(timeoutId)
          terminal.off('stdout', stdoutListener)
          terminal.off('stderr', stderrListener)
          resolve({ stdout, stderr })
        }, 2000)
      }, 500)
    })
  }
}

export const terminalManager = TerminalManager.getInstance()
