import { z } from 'zod'
import { readdir, stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import path from 'path'

const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern to search for files'),
  cwd: z.string().optional().describe('Working directory to search in'),
  max_results: z.number().int().min(1).max(1000).default(100).describe('Maximum number of results'),
  include_hidden: z.boolean().default(false).describe('Include hidden files and directories'),
})

const outputSchema = z.object({
  pattern: z.string().describe('The glob pattern that was used'),
  matches: z.array(z.object({
    path: z.string().describe('File path'),
    type: z.enum(['file', 'directory']).describe('Type of the match'),
    size: z.number().optional().describe('File size in bytes (for files only)'),
  })).describe('Array of matching files and directories'),
  total_matches: z.number().describe('Total number of matches found'),
  truncated: z.boolean().describe('Whether results were truncated due to max_results limit'),
})

export type GlobInput = z.infer<typeof inputSchema>
export type GlobOutput = z.infer<typeof outputSchema>

// Simple glob pattern matching
function matchesGlob(pattern: string, filePath: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\[([^\]]+)\]/g, '[$1]')
  
  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return regex.test(filePath)
}

async function findMatches(
  pattern: string,
  searchDir: string,
  options: {
    maxResults: number
    includeHidden: boolean
  }
): Promise<Array<{ path: string; type: 'file' | 'directory'; size?: number }>> {
  const matches: Array<{ path: string; type: 'file' | 'directory'; size?: number }> = []
  
  async function searchDirectory(dir: string, relativePath: string = ''): Promise<void> {
    if (matches.length >= options.maxResults) return
    
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (matches.length >= options.maxResults) break
        
        // Skip hidden files/directories if not included
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue
        }
        
        const fullPath = path.join(dir, entry.name)
        const relativeEntryPath = path.join(relativePath, entry.name).replace(/\\/g, '/')
        
        if (entry.isDirectory()) {
          // Check if directory matches pattern
          if (matchesGlob(pattern, relativeEntryPath) || matchesGlob(pattern, entry.name)) {
            matches.push({
              path: relativeEntryPath,
              type: 'directory',
            })
          }
          
          // Recursively search subdirectory
          await searchDirectory(fullPath, relativeEntryPath)
        } else if (entry.isFile()) {
          // Check if file matches pattern
          if (matchesGlob(pattern, relativeEntryPath) || matchesGlob(pattern, entry.name)) {
            try {
              const stats = await stat(fullPath)
              matches.push({
                path: relativeEntryPath,
                type: 'file',
                size: stats.size,
              })
            } catch {
              // If we can't stat the file, add it without size
              matches.push({
                path: relativeEntryPath,
                type: 'file',
              })
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await searchDirectory(searchDir)
  return matches
}

export const GlobTool = buildTool({
  name: 'glob',
  searchHint: 'find files and directories using glob patterns',
  maxResultSizeChars: 100_000,
  
  async description(input) {
    return `Find files matching pattern: ${input.pattern}`
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
    return 'Glob Search'
  },
  
  getToolUseSummary(input) {
    return input?.pattern || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Searching for ${summary}` : 'Searching files'
  },
  
  async checkPermissions(input) {
    const { cwd } = input
    
    if (cwd && !path.resolve(cwd).startsWith(process.cwd())) {
      return {
        behavior: 'deny',
        message: `Access denied: Cannot search outside working directory`,
      }
    }
    
    return {
      behavior: 'allow',
      updatedInput: input,
    }
  },
  
  async validateInput(input) {
    const { pattern, max_results } = input
    
    if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
      return {
        result: false,
        message: 'Pattern cannot be empty',
        errorCode: 1,
      }
    }
    
    if (max_results && (max_results < 1 || max_results > 1000)) {
      return {
        result: false,
        message: 'max_results must be between 1 and 1000',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call({ pattern, cwd, max_results, include_hidden }, context, onProgress) {
    const searchDir = cwd ? path.resolve(cwd) : process.cwd()
    
    onProgress?.({
      toolUseID: 'glob-search',
      data: {
        type: 'search_start',
        pattern,
        directory: searchDir,
      },
    })
    
    try {
      const matches = await findMatches(pattern, searchDir, {
        maxResults: max_results,
        includeHidden: include_hidden,
      })
      
      const truncated = matches.length >= max_results
      
      onProgress?.({
        toolUseID: 'glob-search',
        data: {
          type: 'search_complete',
          pattern,
          matches_found: matches.length,
          truncated,
        },
      })
      
      const output: GlobOutput = {
        pattern,
        matches,
        total_matches: matches.length,
        truncated,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: GlobOutput = {
        pattern,
        matches: [],
        total_matches: 0,
        truncated: false,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, GlobOutput>)