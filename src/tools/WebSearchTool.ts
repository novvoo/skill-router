import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'

const inputSchema = z.object({
  query: z.string().min(2).describe('The search query to use'),
  allowed_domains: z
    .array(z.string())
    .optional()
    .describe('Only include search results from these domains'),
  blocked_domains: z
    .array(z.string())
    .optional()
    .describe('Never include search results from these domains'),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe('Maximum number of search results to return'),
})

const searchResultSchema = z.object({
  title: z.string().describe('The title of the search result'),
  url: z.string().describe('The URL of the search result'),
  snippet: z.string().describe('A brief snippet of the content'),
})

const outputSchema = z.object({
  query: z.string().describe('The search query that was executed'),
  results: z.array(searchResultSchema).describe('Array of search results'),
  durationSeconds: z.number().describe('Time taken to complete the search operation'),
  total_results: z.number().describe('Total number of results found'),
})

export type WebSearchInput = z.infer<typeof inputSchema>
export type WebSearchOutput = z.infer<typeof outputSchema>
export type SearchResult = z.infer<typeof searchResultSchema>

export type WebSearchProgress = {
  type: 'search_start' | 'search_results_received' | 'search_complete'
  query?: string
  resultCount?: number
}

// Mock search function - in a real implementation, this would use a search API
async function performWebSearch(
  query: string,
  options: {
    allowedDomains?: string[]
    blockedDomains?: string[]
    maxResults?: number
  },
  signal?: AbortSignal
): Promise<{
  results: SearchResult[]
  totalResults: number
}> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  if (signal?.aborted) {
    throw new Error('Search aborted')
  }
  
  // Mock search results - in a real implementation, this would call a search API
  const mockResults: SearchResult[] = [
    {
      title: `Search results for: ${query}`,
      url: `https://example.com/search?q=${encodeURIComponent(query)}`,
      snippet: `This is a mock search result for the query "${query}". In a real implementation, this would return actual search results from a search engine API.`,
    },
    {
      title: `${query} - Documentation`,
      url: `https://docs.example.com/${query.toLowerCase().replace(/\s+/g, '-')}`,
      snippet: `Official documentation and guides related to ${query}. Learn more about the concepts, APIs, and best practices.`,
    },
    {
      title: `${query} Tutorial`,
      url: `https://tutorial.example.com/${query.toLowerCase().replace(/\s+/g, '-')}`,
      snippet: `Step-by-step tutorial covering ${query}. Includes examples, code samples, and practical exercises.`,
    },
  ]
  
  // Apply domain filtering
  let filteredResults = mockResults
  
  if (options.allowedDomains?.length) {
    filteredResults = filteredResults.filter(result => {
      try {
        const hostname = new URL(result.url).hostname
        return options.allowedDomains!.some(domain => 
          hostname === domain || hostname.endsWith('.' + domain)
        )
      } catch {
        return false
      }
    })
  }
  
  if (options.blockedDomains?.length) {
    filteredResults = filteredResults.filter(result => {
      try {
        const hostname = new URL(result.url).hostname
        return !options.blockedDomains!.some(domain => 
          hostname === domain || hostname.endsWith('.' + domain)
        )
      } catch {
        return true
      }
    })
  }
  
  // Limit results
  const maxResults = options.maxResults || 10
  filteredResults = filteredResults.slice(0, maxResults)
  
  return {
    results: filteredResults,
    totalResults: mockResults.length,
  }
}

export const WebSearchTool = buildTool({
  name: 'web_search',
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  
  async description(input) {
    return `Search the web for: ${input.query}`
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
    return 'Web Search'
  },
  
  getToolUseSummary(input) {
    return input?.query || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Searching for ${summary}` : 'Searching the web'
  },
  
  async checkPermissions(_input) {
    return {
      behavior: 'allow',
      updatedInput: _input,
    }
  },
  
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    
    if (!query.length) {
      return {
        result: false,
        message: 'Search query cannot be empty',
        errorCode: 1,
      }
    }
    
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message: 'Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call(input, context, onProgress) {
    const startTime = performance.now()
    const { query, allowed_domains, blocked_domains, max_results } = input
    
    onProgress?.({
      toolUseID: 'web-search',
      data: {
        type: 'search_start',
        query,
      },
    })
    
    try {
      const searchResult = await performWebSearch(
        query,
        {
          allowedDomains: allowed_domains,
          blockedDomains: blocked_domains,
          maxResults: max_results,
        },
        context.abortController.signal
      )
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_results_received',
          query,
          resultCount: searchResult.results.length,
        },
      })
      
      const endTime = performance.now()
      const durationSeconds = (endTime - startTime) / 1000
      
      const output: WebSearchOutput = {
        query,
        results: searchResult.results,
        durationSeconds,
        total_results: searchResult.totalResults,
      }
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_complete',
          query,
          resultCount: searchResult.results.length,
        },
      })
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: WebSearchOutput = {
        query,
        results: [],
        durationSeconds: (performance.now() - startTime) / 1000,
        total_results: 0,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, WebSearchOutput, WebSearchProgress>)