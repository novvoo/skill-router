import { z } from 'zod'
import { readFile, readdir, stat } from 'fs/promises'
import { buildTool, type ToolDef } from './Tool.js'
import path from 'path'

const inputSchema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().describe('File or directory path to search in'),
  recursive: z.boolean().default(true).describe('Search recursively in subdirectories'),
  case_sensitive: z.boolean().default(false).describe('Case sensitive search'),
  max_results: z.number().int().min(1).max(1000).default(100).describe('Maximum number of matches'),
  context_lines: z.number().int().min(0).max(10).default(2).describe('Number of context lines around matches'),
  include_line_numbers: z.boolean().default(true).describe('Include line numbers in results'),
})

const outputSchema = z.object({
  pattern: z.string().describe('The search pattern that was used'),
  search_path: z.string().describe('The path that was searched'),
  matches: z.array(z.object({
    file: z.string().describe('File path where match was found'),
    line_number: z.number().optional().describe('Line number of the match'),
    line_content: z.string().describe('Content of the matching line'),
    context_before: z.array(z.string()).optional().describe('Lines before the match'),
    context_after: z.array(z.string()).optional().describe('Lines after the match'),
  })).describe('Array of search matches'),
  total_matches: z.number().describe('Total number of matches found'),
  files_searched: z.number().describe('Number of files searched'),
  truncated: z.boolean().describe('Whether results were truncated due to max_results limit'),
})

export type GrepInput = z.infer<typeof inputSchema>
export type GrepOutput = z.infer<typeof outputSchema>

interface SearchMatch {
  file: string
  line_number?: number
  line_content: string
  context_before?: string[]
  context_after?: string[]
}

async function searchInFile(
  filePath: string,
  pattern: RegExp,
  options: {
    contextLines: number
    includeLineNumbers: boolean
    maxResults: number
    currentMatches: number
  }
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = []
  
  try {
    const content = await readFile(filePath, 'utf8')
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      if (matches.length + options.currentMatches >= options.maxResults) {
        break
      }
      
      const line = lines[i]
      if (pattern.test(line)) {
        const match: SearchMatch = {
          file: filePath,
          line_content: line,
        }
        
        if (options.includeLineNumbers) {
          match.line_number = i + 1
        }
        
        if (options.contextLines > 0) {
          // Get context lines before
          const beforeStart = Math.max(0, i - options.contextLines)
          const beforeEnd = i
          if (beforeStart < beforeEnd) {
            match.context_before = lines.slice(beforeStart, beforeEnd)
          }
          
          // Get context lines after
          const afterStart = i + 1
          const afterEnd = Math.min(lines.length, i + 1 + options.contextLines)
          if (afterStart < afterEnd) {
            match.context_after = lines.slice(afterStart, afterEnd)
          }
        }
        
        matches.push(match)
      }
    }
  } catch (error) {
    // Skip files we can't read
  }
  
  return matches
}

async function searchInDirectory(
  dirPath: string,
  pattern: RegExp,
  options: {
    recursive: boolean
    contextLines: number
    includeLineNumbers: boolean
    maxResults: number
  }
): Promise<{ matches: SearchMatch[]; filesSearched: number }> {
  const allMatches: SearchMatch[] = []
  let filesSearched = 0
  
  async function searchDir(currentDir: string): Promise<void> {
    if (allMatches.length >= options.maxResults) return
    
    try {
      const entries = await readdir(currentDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (allMatches.length >= options.maxResults) break
        
        const fullPath = path.join(currentDir, entry.name)
        
        if (entry.isDirectory() && options.recursive) {
          // Skip hidden directories
          if (!entry.name.startsWith('.')) {
            await searchDir(fullPath)
          }
        } else if (entry.isFile()) {
          // Skip binary files and hidden files
          if (!entry.name.startsWith('.') && isTextFile(entry.name)) {
            filesSearched++
            const matches = await searchInFile(fullPath, pattern, {
              contextLines: options.contextLines,
              includeLineNumbers: options.includeLineNumbers,
              maxResults: options.maxResults,
              currentMatches: allMatches.length,
            })
            allMatches.push(...matches)
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await searchDir(dirPath)
  return { matches: allMatches, filesSearched }
}

function isTextFile(filename: string): boolean {
  const textExtensions = [
    '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.css', '.html', '.htm', '.xml', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.sql', '.r', '.rb', '.php',
    '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs', '.elm', '.ex', '.exs',
    '.vue', '.svelte', '.astro', '.dockerfile', '.gitignore', '.gitattributes',
  ]
  
  const ext = path.extname(filename).toLowerCase()
  return textExtensions.includes(ext) || !ext // Files without extension are often text
}

export const GrepTool = buildTool({
  name: 'grep',
  searchHint: 'search for text patterns in files using regular expressions',
  maxResultSizeChars: 100_000,
  
  async description(input) {
    return `Search for pattern "${input.pattern}" in ${input.path}`
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
    return 'Grep Search'
  },
  
  getToolUseSummary(input) {
    return input?.pattern || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Searching for ${summary}` : 'Searching text'
  },
  
  async checkPermissions(input) {
    const { path: searchPath } = input
    
    if (!path.resolve(searchPath).startsWith(process.cwd())) {
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
    const { pattern, max_results, context_lines } = input
    
    if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
      return {
        result: false,
        message: 'Pattern cannot be empty',
        errorCode: 1,
      }
    }
    
    // Test if pattern is a valid regex
    try {
      new RegExp(pattern)
    } catch {
      return {
        result: false,
        message: 'Invalid regular expression pattern',
        errorCode: 2,
      }
    }
    
    if (max_results && (max_results < 1 || max_results > 1000)) {
      return {
        result: false,
        message: 'max_results must be between 1 and 1000',
        errorCode: 3,
      }
    }
    
    if (context_lines && (context_lines < 0 || context_lines > 10)) {
      return {
        result: false,
        message: 'context_lines must be between 0 and 10',
        errorCode: 4,
      }
    }
    
    return { result: true }
  },
  
  async call({ pattern, path: searchPath, recursive, case_sensitive, max_results, context_lines, include_line_numbers }, context, onProgress) {
    onProgress?.({
      toolUseID: 'grep-search',
      data: {
        type: 'search_start',
        pattern,
        path: searchPath,
      },
    })
    
    try {
      // Create regex pattern
      const flags = case_sensitive ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)
      
      // Check if search path is a file or directory
      const stats = await stat(searchPath)
      let matches: SearchMatch[] = []
      let filesSearched = 0
      
      if (stats.isFile()) {
        // Search in single file
        matches = await searchInFile(searchPath, regex, {
          contextLines: context_lines,
          includeLineNumbers: include_line_numbers,
          maxResults: max_results,
          currentMatches: 0,
        })
        filesSearched = 1
      } else if (stats.isDirectory()) {
        // Search in directory
        const result = await searchInDirectory(searchPath, regex, {
          recursive,
          contextLines: context_lines,
          includeLineNumbers: include_line_numbers,
          maxResults: max_results,
        })
        matches = result.matches
        filesSearched = result.filesSearched
      }
      
      const truncated = matches.length >= max_results
      
      onProgress?.({
        toolUseID: 'grep-search',
        data: {
          type: 'search_complete',
          pattern,
          matches_found: matches.length,
          files_searched: filesSearched,
          truncated,
        },
      })
      
      const output: GrepOutput = {
        pattern,
        search_path: searchPath,
        matches,
        total_matches: matches.length,
        files_searched: filesSearched,
        truncated,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: GrepOutput = {
        pattern,
        search_path: searchPath,
        matches: [],
        total_matches: 0,
        files_searched: 0,
        truncated: false,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, GrepOutput>)