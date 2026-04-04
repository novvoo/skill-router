import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { fileOperationsManager } from '../utils/fileOperations.js'

const inputSchema = z.object({
  old_path: z.string().describe('Current path of the file'),
  new_path: z.string().describe('New path for the file'),
})

const outputSchema = z.object({
  old_path: z.string().describe('Original file path'),
  new_path: z.string().describe('New file path'),
  backup_path: z.string().optional().describe('Path to the backup file if created'),
})

export type FileRenameInput = z.infer<typeof inputSchema>
export type FileRenameOutput = z.infer<typeof outputSchema>

export const FileRenameTool = buildTool({
  name: 'file_rename',
  searchHint: 'rename or move files',
  maxResultSizeChars: 10_000,

  async description(input) {
    return `Rename file: ${input.old_path} -> ${input.new_path}`
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
    return 'File Rename/Move'
  },

  getToolUseSummary(input) {
    return input?.old_path ? `${input.old_path} -> ${input.new_path}` : null
  },

  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Renaming ${summary}` : 'Renaming file'
  },

  async checkPermissions(input) {
    return {
      behavior: 'ask',
      message: `Allow renaming/moving file "${input.old_path}" to "${input.new_path}"?`,
      suggestions: [
        {
          type: 'allow_once',
          label: 'Allow once',
        },
      ],
    }
  },

  async validateInput(input) {
    const { old_path, new_path } = input

    if (!old_path || typeof old_path !== 'string' || !old_path.trim()) {
      return {
        result: false,
        message: 'Old path cannot be empty',
        errorCode: 1,
      }
    }

    if (!new_path || typeof new_path !== 'string' || !new_path.trim()) {
      return {
        result: false,
        message: 'New path cannot be empty',
        errorCode: 2,
      }
    }

    if (old_path === new_path) {
      return {
        result: false,
        message: 'Old path and new path cannot be the same',
        errorCode: 3,
      }
    }

    return { result: true }
  },

  async call({ old_path, new_path }, context, onProgress) {
    onProgress?.({
      toolUseID: 'file-rename',
      data: {
        type: 'rename_start',
        old_path,
        new_path,
      },
    })

    try {
      const result = await fileOperationsManager.safeRenameFile(old_path, new_path)

      if (!result.success) {
        return {
          data: {
            old_path,
            new_path,
          },
          error: result.error,
        }
      }

      onProgress?.({
        toolUseID: 'file-rename',
        data: {
          type: 'rename_complete',
          old_path,
          new_path,
          backup_path: result.backupPath,
        },
      })

      const output: FileRenameOutput = {
        old_path,
        new_path,
        backup_path: result.backupPath,
      }

      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      const output: FileRenameOutput = {
        old_path,
        new_path,
      }

      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, FileRenameOutput>)
