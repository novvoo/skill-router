import { z } from 'zod'
import { stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import { fileOperationsManager } from '../utils/fileOperations.js'
import { existsSync } from 'fs'

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
  backup_path: z.string().optional().describe('Path to the backup file if created'),
})

export type FileWriteInput = z.infer<typeof inputSchema>
export type FileWriteOutput = z.infer<typeof outputSchema>

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
    return false
  },
  
  isReadOnly() {
    return false
  },
  
  isDestructive() {
    return true
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
    
    if (content.length > 10_000_000) {
      return {
        result: false,
        message: 'Content too large (max 10MB)',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call({ path: filePath, content, encoding }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-write',
      data: {
        type: 'write_start',
        path: filePath,
        size: content.length,
      },
    })
    
    try {
      let fileExists = existsSync(filePath)
      
      const result = await fileOperationsManager.safeWriteFile(filePath, content, { encoding: encoding as BufferEncoding })
      
      if (!result.success) {
        return {
          data: {
            path: filePath,
            size: 0,
            lines: 0,
            encoding,
            created: false,
          },
          error: result.error,
        }
      }
      
      const lines = content.split('\n').length
      const size = Buffer.byteLength(content, encoding as BufferEncoding)
      
      onProgress?.({
        toolUseID: 'file-write',
        data: {
          type: 'write_complete',
          path: filePath,
          size,
          lines,
          backup_path: result.backupPath,
        },
      })
      
      const output: FileWriteOutput = {
        path: filePath,
        size,
        lines,
        encoding,
        created: !fileExists,
        backup_path: result.backupPath,
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