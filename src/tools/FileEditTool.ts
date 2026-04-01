import { z } from 'zod'
import { readFile, writeFile, stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import path from 'path'

const inputSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  old_str: z.string().describe('The exact string to replace'),
  new_str: z.string().describe('The new string to replace with'),
  encoding: z.string().default('utf8').describe('File encoding'),
})

const outputSchema = z.object({
  path: z.string().describe('File path that was edited'),
  changes_made: z.number().describe('Number of replacements made'),
  old_size: z.number().describe('Original file size in bytes'),
  new_size: z.number().describe('New file size in bytes'),
  encoding: z.string().describe('File encoding used'),
})

export type FileEditInput = z.infer<typeof inputSchema>
export type FileEditOutput = z.infer<typeof outputSchema>

function isPathSafe(filePath: string): boolean {
  const normalizedPath = path.normalize(filePath)
  
  if (normalizedPath.includes('..')) {
    return false
  }
  
  if (path.isAbsolute(normalizedPath)) {
    const cwd = process.cwd()
    const resolvedPath = path.resolve(normalizedPath)
    if (!resolvedPath.startsWith(cwd)) {
      return false
    }
  }
  
  return true
}

export const FileEditTool = buildTool({
  name: 'file_edit',
  searchHint: 'edit files by replacing text',
  maxResultSizeChars: 10_000,
  
  async description(input) {
    return `Edit file: ${input.path}`
  },
  
  inputSchema,
  outputSchema,
  
  isConcurrencySafe() {
    return false // File editing is not safe for concurrent execution
  },
  
  isReadOnly() {
    return false
  },
  
  isDestructive() {
    return true // Editing files is destructive
  },
  
  userFacingName() {
    return 'File Edit'
  },
  
  getToolUseSummary(input) {
    return input?.path || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Editing ${summary}` : 'Editing file'
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
      message: `Allow editing file "${filePath}"?`,
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
    const { path: filePath, old_str, new_str } = input
    
    if (!filePath.trim()) {
      return {
        result: false,
        message: 'File path cannot be empty',
        errorCode: 1,
      }
    }
    
    if (!old_str) {
      return {
        result: false,
        message: 'old_str cannot be empty',
        errorCode: 2,
      }
    }
    
    if (old_str === new_str) {
      return {
        result: false,
        message: 'old_str and new_str cannot be the same',
        errorCode: 3,
      }
    }
    
    return { result: true }
  },
  
  async call({ path: filePath, old_str, new_str, encoding }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-edit',
      data: {
        type: 'edit_start',
        path: filePath,
      },
    })
    
    try {
      // Check if file exists
      const stats = await stat(filePath)
      if (!stats.isFile()) {
        return {
          data: {
            path: filePath,
            changes_made: 0,
            old_size: 0,
            new_size: 0,
            encoding,
          },
          error: `Path "${filePath}" is not a file`,
        }
      }
      
      // Read file content
      const originalContent = await readFile(filePath, { encoding: encoding as BufferEncoding })
      const oldSize = Buffer.byteLength(originalContent, encoding as BufferEncoding)
      
      // Count occurrences of old_str
      const occurrences = (originalContent.match(new RegExp(old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      
      if (occurrences === 0) {
        return {
          data: {
            path: filePath,
            changes_made: 0,
            old_size: oldSize,
            new_size: oldSize,
            encoding,
          },
          error: `String "${old_str}" not found in file`,
        }
      }
      
      // Replace all occurrences
      const newContent = originalContent.replace(new RegExp(old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), new_str)
      const newSize = Buffer.byteLength(newContent, encoding as BufferEncoding)
      
      // Write back to file
      await writeFile(filePath, newContent, { encoding: encoding as BufferEncoding })
      
      onProgress?.({
        toolUseID: 'file-edit',
        data: {
          type: 'edit_complete',
          path: filePath,
          changes_made: occurrences,
          old_size: oldSize,
          new_size: newSize,
        },
      })
      
      const output: FileEditOutput = {
        path: filePath,
        changes_made: occurrences,
        old_size: oldSize,
        new_size: newSize,
        encoding,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: FileEditOutput = {
        path: filePath,
        changes_made: 0,
        old_size: 0,
        new_size: 0,
        encoding,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, FileEditOutput>)