import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { fileOperationsManager } from '../utils/fileOperations.js'

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
  backup_path: z.string().optional().describe('Path to the backup file if created'),
})

export type FileEditInput = z.infer<typeof inputSchema>
export type FileEditOutput = z.infer<typeof outputSchema>

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
    return false
  },

  isReadOnly() {
    return false
  },

  isDestructive() {
    return true
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
    
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
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
      const fileInfo = await fileOperationsManager.getFileInfo(filePath)
      
      if (!fileInfo.isFile) {
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

      const readResult = await fileOperationsManager.safeReadFile(filePath, { encoding: encoding as BufferEncoding })
      
      if (!readResult.success) {
        return {
          data: {
            path: filePath,
            changes_made: 0,
            old_size: 0,
            new_size: 0,
            encoding,
          },
          error: readResult.error,
        }
      }

      const originalContent = readResult.content!
      const oldSize = Buffer.byteLength(originalContent, encoding as BufferEncoding)

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

      const newContent = originalContent.replace(new RegExp(old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), new_str)
      const newSize = Buffer.byteLength(newContent, encoding as BufferEncoding)

      const writeResult = await fileOperationsManager.safeWriteFile(filePath, newContent, { encoding: encoding as BufferEncoding })

      if (!writeResult.success) {
        return {
          data: {
            path: filePath,
            changes_made: 0,
            old_size: oldSize,
            new_size: oldSize,
            encoding,
          },
          error: writeResult.error,
        }
      }

      onProgress?.({
        toolUseID: 'file-edit',
        data: {
          type: 'edit_complete',
          path: filePath,
          changes_made: occurrences,
          old_size: oldSize,
          new_size: newSize,
          backup_path: writeResult.backupPath,
        },
      })

      const output: FileEditOutput = {
        path: filePath,
        changes_made: occurrences,
        old_size: oldSize,
        new_size: newSize,
        encoding,
        backup_path: writeResult.backupPath,
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