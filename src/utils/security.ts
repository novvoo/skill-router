import { join, normalize, resolve, isAbsolute } from 'path'
import { accessSync, constants } from 'fs'
import { z } from 'zod'

export interface SecurityConfig {
  allowedPaths: string[]
  blockedPaths: string[]
  allowedExtensions: string[]
  maxFileSizeBytes: number
  enablePathValidation: boolean
}

const DEFAULT_CONFIG: SecurityConfig = {
  allowedPaths: [process.cwd()],
  blockedPaths: [],
  allowedExtensions: ['.js', '.ts', '.json', '.md', '.txt', '.html', '.css', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.yaml', '.yml', '.xml'],
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  enablePathValidation: true
}

export class SecurityManager {
  private config: SecurityConfig
  private allowedPathSet: Set<string>
  private blockedPathSet: Set<string>

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.allowedPathSet = new Set(this.config.allowedPaths.map(p => this.normalizePath(p)))
    this.blockedPathSet = new Set(this.config.blockedPaths.map(p => this.normalizePath(p)))
  }

  private normalizePath(path: string): string {
    return normalize(resolve(path)).toLowerCase()
  }

  validatePath(inputPath: string): { valid: true; normalizedPath: string } | { valid: false; error: string } {
    if (!this.config.enablePathValidation) {
      return { valid: true, normalizedPath: inputPath }
    }

    if (!inputPath || typeof inputPath !== 'string') {
      return { valid: false, error: 'Invalid path: path must be a non-empty string' }
    }

    const normalizedInputPath = this.normalizePath(inputPath)

    for (const blockedPath of this.blockedPathSet) {
      if (normalizedInputPath.startsWith(blockedPath)) {
        return { valid: false, error: `Path is blocked: ${inputPath}` }
      }
    }

    let isAllowed = false
    for (const allowedPath of this.allowedPathSet) {
      if (normalizedInputPath.startsWith(allowedPath)) {
        isAllowed = true
        break
      }
    }

    if (!isAllowed) {
      return { valid: false, error: `Path is not in allowed list: ${inputPath}` }
    }

    try {
      if (isAbsolute(inputPath)) {
        accessSync(inputPath, constants.R_OK)
      }
    } catch (error) {
    }

    return { valid: true, normalizedPath: inputPath }
  }

  validateFileExtension(filePath: string): boolean {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'))
    return this.config.allowedExtensions.includes(ext) || this.config.allowedExtensions.length === 0
  }

  validateFileSize(size: number): boolean {
    return size <= this.config.maxFileSizeBytes
  }

  sanitizeInput(input: unknown): string {
    if (input == null) {
      return ''
    }
    const str = String(input)
    return str.replace(/[^\x20-\x7E\n\r\t]/g, '')
  }

  sanitizeCommand(cmd: string): string {
    const dangerousPatterns = [
      /[;&|`]/g,
      /\$\([^)]*\)/g,
      /`[^`]*`/g,
    ]
    
    let sanitized = cmd
    for (const pattern of dangerousPatterns) {
      sanitized = sanitized.replace(pattern, '')
    }
    return sanitized
  }

  addAllowedPath(path: string): void {
    this.allowedPathSet.add(this.normalizePath(path))
  }

  addBlockedPath(path: string): void {
    this.blockedPathSet.add(this.normalizePath(path))
  }

  removeAllowedPath(path: string): void {
    this.allowedPathSet.delete(this.normalizePath(path))
  }

  removeBlockedPath(path: string): void {
    this.blockedPathSet.delete(this.normalizePath(path))
  }
}

const defaultSecurityManager = new SecurityManager()
export { defaultSecurityManager as securityManager }

export const FileReadInputSchema = z.object({
  path: z.string().min(1, 'Path is required')
})

export const FileWriteInputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  content: z.string().min(0)
})

export const FileEditInputSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  old_string: z.string().min(1, 'Old string is required'),
  new_string: z.string()
})

export const BashInputSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).optional()
})

export const WebSearchInputSchema = z.object({
  query: z.string().min(1, 'Query is required')
})

export const WebFetchInputSchema = z.object({
  url: z.string().url('Invalid URL')
})

export function validateInput<T>(schema: z.ZodType<T>, input: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(input)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }
    }
    return { success: false, error: 'Validation failed' }
  }
}
