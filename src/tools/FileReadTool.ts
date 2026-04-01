import { z } from 'zod'
import { readFile, stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import path from 'path'

const inputSchema = z.object({
  path: z.string().describe('Path to the file to read'),
  start_line: z.number().int().min(1).optional().describe('Starting line number (1-based)'),
  end_line: z.number().int().min(1).optional().describe('Ending line number (1-based)'),
  encoding: z.string().default('utf8').describe('File encoding'),
})

const outputSchema = z.object({
  content: z.string().describe('File content'),
  path: z.string().describe('File path that was read'),
  size: z.number().describe('File size in bytes'),
  lines: z.number().describe('Total number of lines'),
  encoding: z.string().describe('File encoding used'),
})

export type FileReadInput = z.infer<typeof inputSchema>
export type FileReadOutput = z.infer<typeof outputSchema>

function isPathSafe(filePath: string): boolean {
  // Normalize the path
  const normalizedPath = path.normalize(filePath)
  
  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    return false
  }
  
  // Check for absolute paths outside of current working directory
  if (path.isAbsolute(normalizedPath)) {
    const cwd = process.cwd()
    const resolvedPath = path.resolve(normalizedPath)
    if (!resolvedPath.startsWith(cwd)) {
      return false
    }
  }
  
  return true
}

function extractLines(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split('\n')
  
  if (!startLine && !endLine) {
    return content
  }
  
  const start = startLine ? Math.max(1, startLine) - 1 : 0
  const end = endLine ? Math.min(lines.length, endLine) : lines.length
  
  return lines.slice(start, end).join('\n')
}

export const FileReadTool = buildTool({
  name: 'file_read',
  searchHint: 'read and display file contents',
  maxResultSizeChars: 1_000_000, // 1MB limit
  
  async description(input) {
    return `Read file: ${input.path}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return true
  },
  
  isReadOnly() {
    return true
  },
  
  userFacingName() {
    return 'File Read'
  },
  
  getToolUseSummary(input) {
    return input?.path || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Reading ${summary}` : 'Reading file'
  },
  
  async checkPermissions(input) {
    const { path: filePath } = input
    
    if (!isPathSafe(filePath)) {
      return {
        behavior: 'deny',
        message: `Access denied: Path "${filePath}" is not allowed`,
      }
    }
    
    return {
      behavior: 'allow',
      updatedInput: input,
    }
  },
  
  async validateInput(input) {
    const { path: filePath, start_line, end_line } = input
    
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      return {
        result: false,
        message: 'File path cannot be empty',
        errorCode: 1,
      }
    }
    
    if (start_line && end_line && start_line > end_line) {
      return {
        result: false,
        message: 'start_line cannot be greater than end_line',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call({ path: filePath, start_line, end_line, encoding }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-read',
      data: {
        type: 'read_start',
        path: filePath,
      },
    })
    
    try {
      // Check if file exists and get stats
      const stats = await stat(filePath)
      
      if (!stats.isFile()) {
        return {
          data: {
            content: '',
            path: filePath,
            size: 0,
            lines: 0,
            encoding,
          },
          error: `Path "${filePath}" is not a file`,
        }
      }
      
      // Read file content
      const content = await readFile(filePath, { encoding: encoding as BufferEncoding })
      const lines = content.split('\n')
      
      onProgress?.({
        toolUseID: 'file-read',
        data: {
          type: 'read_complete',
          path: filePath,
          size: stats.size,
          lines: lines.length,
        },
      })
      
      // Extract specified lines if requested
      const extractedContent = extractLines(content, start_line, end_line)
      
      const output: FileReadOutput = {
        content: extractedContent,
        path: filePath,
        size: stats.size,
        lines: lines.length,
        encoding,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: FileReadOutput = {
        content: '',
        path: filePath,
        size: 0,
        lines: 0,
        encoding,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, FileReadOutput>)