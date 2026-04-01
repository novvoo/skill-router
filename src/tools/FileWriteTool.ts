import { z } from 'zod'
import { writeFile, mkdir, stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import path from 'path'

const inputSchema = z.object({
  path: z.string().describe('Path to the file to write'),
  content: z.string().describe('Content to write to the file'),
  encoding: z.string().default('utf8').describe('File encoding'),
  create_dirs: z.boolean().default(true).describe('Create parent directories if they don\'t exist'),
})

const outputSchema = z.object({
  path: z.string().describe('File path that was written'),
  size: z.number().describe('Number of bytes written'),
  lines: z.number().describe('Number of lines written'),
  encoding: z.string().describe('File encoding used'),
  created: z.boolean().describe('Whether the file was created (true) or overwritten (false)'),
})

export type FileWriteInput = z.infer<typeof inputSchema>
export type FileWriteOutput = z.infer<typeof outputSchema>

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

export const FileWriteTool = buildTool({
  name: 'file_write',
  searchHint: 'write content to files',
  maxResultSizeChars: 10_000,
  
  async description(input) {
    return `Write to file: ${input.path}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return false // File writing is not safe for concurrent execution
  },
  
  isReadOnly() {
    return false
  },
  
  isDestructive() {
    return true // Writing files is destructive
  },
  
  userFacingName() {
    return 'File Write'
  },
  
  getToolUseSummary(input) {
    return input?.path || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Writing to ${summary}` : 'Writing file'
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
      behavior: 'ask',
      message: `Allow writing to file "${filePath}"?`,
      suggestions: [
        {
          type: 'allow_once',
          label: 'Allow once',
        },
        {
          type: 'allow_directory',
          label: 'Allow this directory',
        },
      ],
    }
  },
  
  async validateInput(input) {
    const { path: filePath, content } = input
    
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      return {
        result: false,
        message: 'File path cannot be empty',
        errorCode: 1,
      }
    }
    
    if (content.length > 10_000_000) { // 10MB limit
      return {
        result: false,
        message: 'Content too large (max 10MB)',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call({ path: filePath, content, encoding, create_dirs }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-write',
      data: {
        type: 'write_start',
        path: filePath,
        size: content.length,
      },
    })
    
    try {
      // Check if file already exists
      let fileExists = false
      try {
        await stat(filePath)
        fileExists = true
      } catch {
        // File doesn't exist
      }
      
      // Create parent directories if requested
      if (create_dirs) {
        const dir = path.dirname(filePath)
        await mkdir(dir, { recursive: true })
      }
      
      // Write file content
      await writeFile(filePath, content, { encoding: encoding as BufferEncoding })
      
      const lines = content.split('\n').length
      const size = Buffer.byteLength(content, encoding as BufferEncoding)
      
      onProgress?.({
        toolUseID: 'file-write',
        data: {
          type: 'write_complete',
          path: filePath,
          size,
          lines,
        },
      })
      
      const output: FileWriteOutput = {
        path: filePath,
        size,
        lines,
        encoding,
        created: !fileExists,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: FileWriteOutput = {
        path: filePath,
        size: 0,
        lines: 0,
        encoding,
        created: false,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, FileWriteOutput>)