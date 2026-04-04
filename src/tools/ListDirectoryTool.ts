import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { fileOperationsManager, type FileInfo } from '../utils/fileOperations.js'

const inputSchema = z.object({
  path: z.string().default('.').describe('Path to the directory to list'),
})

const outputSchema = z.object({
  path: z.string().describe('Directory path that was listed'),
  files: z.array(z.object({
    path: z.string(),
    name: z.string(),
    size: z.number(),
    is_directory: z.boolean(),
    is_file: z.boolean(),
    mtime: z.string(),
    extname: z.string(),
  })),
  total_files: z.number(),
  total_directories: z.number(),
})

export type ListDirectoryInput = z.infer<typeof inputSchema>
export type ListDirectoryOutput = z.infer<typeof outputSchema>

export const ListDirectoryTool = buildTool({
  name: 'list_directory',
  searchHint: 'list directory contents',
  maxResultSizeChars: 50_000,

  async description(input) {
    return `List directory: ${input.path}`
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
    return 'List Directory'
  },

  getToolUseSummary(input) {
    return input?.path || null
  },

  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Listing ${summary}` : 'Listing directory'
  },

  async checkPermissions(input) {
    const { path: dirPath } = input

    return {
      behavior: 'allow',
      updatedInput: input,
    }
  },

  async validateInput(input) {
    const { path: dirPath } = input

    if (!dirPath || typeof dirPath !== 'string') {
      return {
        result: false,
        message: 'Directory path cannot be empty',
        errorCode: 1,
      }
    }

    return { result: true }
  },

  async call({ path: dirPath }, context, onProgress) {
    onProgress?.({
      toolUseID: 'list-directory',
      data: {
        type: 'list_start',
        path: dirPath,
      },
    })

    try {
      const result = await fileOperationsManager.listDirectory(dirPath)

      if (!result.success) {
        return {
          data: {
            path: dirPath,
            files: [],
            total_files: 0,
            total_directories: 0,
          },
          error: result.error,
        }
      }

      const files = result.files || []
      const totalFiles = files.filter(f => f.isFile).length
      const totalDirectories = files.filter(f => f.isDirectory).length

      const formattedFiles = files.map((file: FileInfo) => ({
        path: file.path,
        name: file.name,
        size: file.size,
        is_directory: file.isDirectory,
        is_file: file.isFile,
        mtime: file.mtime.toISOString(),
        extname: file.extname,
      }))

      onProgress?.({
        toolUseID: 'list-directory',
        data: {
          type: 'list_complete',
          path: dirPath,
          total_files: totalFiles,
          total_directories: totalDirectories,
        },
      })

      const output: ListDirectoryOutput = {
        path: dirPath,
        files: formattedFiles,
        total_files: totalFiles,
        total_directories: totalDirectories,
      }

      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      const output: ListDirectoryOutput = {
        path: dirPath,
        files: [],
        total_files: 0,
        total_directories: 0,
      }

      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, ListDirectoryOutput>)
