import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { fileOperationsManager } from '../utils/fileOperations.js'

const inputSchema = z.object({
  path: z.string().describe('Path to the file to delete'),
})

const outputSchema = z.object({
  path: z.string().describe('File path that was deleted'),
  backup_path: z.string().optional().describe('Path to the backup file if created'),
})

export type FileDeleteInput = z.infer<typeof inputSchema>
export type FileDeleteOutput = z.infer<typeof outputSchema>

export const FileDeleteTool = buildTool({
  name: 'file_delete',
  searchHint: 'delete files',
  maxResultSizeChars: 10_000,

  async description(input) {
    return `Delete file: ${input.path}`
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
    return 'File Delete'
  },

  getToolUseSummary(input) {
    return input?.path || null
  },

  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Deleting ${summary}` : 'Deleting file'
  },

  async checkPermissions(input) {
    const { path: filePath } = input

    return {
      behavior: 'ask',
      message: `Allow deleting file "${filePath}"?`,
      suggestions: [
        {
          type: 'allow_once',
          label: 'Allow once',
        },
      ],
    }
  },

  async validateInput(input) {
    const { path: filePath } = input

    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      return {
        result: false,
        message: 'File path cannot be empty',
        errorCode: 1,
      }
    }

    return { result: true }
  },

  async call({ path: filePath }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-delete',
      data: {
        type: 'delete_start',
        path: filePath,
      },
    })

    try {
      const result = await fileOperationsManager.safeDeleteFile(filePath)

      if (!result.success) {
        return {
          data: {
            path: filePath,
          },
          error: result.error,
        }
      }

      onProgress?.({
        toolUseID: 'file-delete',
        data: {
          type: 'delete_complete',
          path: filePath,
          backup_path: result.backupPath,
        },
      })

      const output: FileDeleteOutput = {
        path: filePath,
        backup_path: result.backupPath,
      }

      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      const output: FileDeleteOutput = {
        path: filePath,
      }

      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, FileDeleteOutput>)
