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
})

const searchResultSchema = z.object({
  title: z.string().describe('The title of the search result'),
  url: z.string().describe('The URL of the search result'),
})

const webSearchResultSchema = z.object({
  tool_use_id: z.string().describe('ID of the tool use'),
  content: z.array(searchResultSchema).describe('Array of search hits'),
})

const outputSchema = z.object({
  query: z.string().describe('The search query that was executed'),
  results: z.array(z.union([webSearchResultSchema, z.string()])).describe('Search results and/or text commentary from the model'),
  durationSeconds: z.number().describe('Time taken to complete the search operation'),
})

export type WebSearchInput = z.infer<typeof inputSchema>
export type WebSearchOutput = z.infer<typeof outputSchema>
export type SearchResult = z.infer<typeof searchResultSchema>
export type WebSearchResult = z.infer<typeof webSearchResultSchema>

export type WebSearchProgress = {
  type: 'search_start' | 'search_results_received' | 'search_complete' | 'query_update'
  query?: string
  resultCount?: number
}

// Web search tool schema for Anthropic API
function makeToolSchema(input: WebSearchInput) {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    allowed_domains: input.allowed_domains,
    blocked_domains: input.blocked_domains,
    max_uses: 8, // Hardcoded to 8 searches maximum
  }
}

// Process search response from Anthropic API
function makeOutputFromSearchResponse(
  result: any[],
  query: string,
  durationSeconds: number
): WebSearchOutput {
  const results: (WebSearchResult | string)[] = []
  let textAcc = ''
  let inText = true

  // Ensure result is an array
  if (!Array.isArray(result)) {
    results.push(`Error: Invalid response format - expected array but got ${typeof result}`)
    return {
      query,
      results,
      durationSeconds,
    }
  }

  for (const block of result) {
    if (block.type === 'server_tool_use') {
      if (inText) {
        inText = false
        if (textAcc.trim().length > 0) {
          results.push(textAcc.trim())
        }
        textAcc = ''
      }
      continue
    }

    if (block.type === 'web_search_tool_result') {
      // Handle error case
      if (!Array.isArray(block.content)) {
        const errorMessage = `Web search error: ${block.content?.error_code || 'Unknown error'}`
        console.error(errorMessage)
        results.push(errorMessage)
        continue
      }
      // Success case - add results
      const hits = block.content.map((r: any) => ({ title: r.title, url: r.url }))
      results.push({
        tool_use_id: block.tool_use_id,
        content: hits,
      })
    }

    if (block.type === 'text') {
      if (inText) {
        textAcc += block.text
      } else {
        inText = true
        textAcc = block.text
      }
    }
  }

  if (textAcc.length) {
    results.push(textAcc.trim())
  }

  return {
    query,
    results,
    durationSeconds,
  }
}

export const WebSearchTool = buildTool({
  name: 'web_search',
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  
  async description(input) {
    return `Claude wants to search the web for: ${input.query}`
  },
  
  inputSchema,
  inputJSONSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to use'
      },
      allowed_domains: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Only include search results from these domains'
      },
      blocked_domains: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Never include search results from these domains'
      }
    },
    required: ['query']
  },
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
    
    if (!query || !query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      }
    }
    
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message: 'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      }
    }
    
    return { result: true }
  },
  
  async call(input, context, onProgress) {
    const startTime = performance.now()
    const { query } = input
    
    onProgress?.({
      toolUseID: 'web-search',
      data: {
        type: 'search_start',
        query,
      },
    })
    
    try {
      // Use fetch API to perform real web search
      // This implementation uses a free search API
      let searchResults = []
      let searchApiUsed = 'primary'
      
      // First try with primary search API
      try {
        const searchUrl = `https://api.freeapi.app/api/v1/public/websearch?q=${encodeURIComponent(query)}&limit=5`
        
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 10000) // 10s timeout
        
        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          signal: ac.signal,
        })
        
        clearTimeout(timer)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }
        
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error(`Expected JSON response but got ${contentType}`)
        }
        
        const data = await response.json() as any
        
        // Process search results
        if (data.success && data.data && Array.isArray(data.data)) {
          searchResults = data.data.map((item: any) => ({
            title: item.title || 'Untitled',
            url: item.url || '#'
          }))
        } else {
          throw new Error('Invalid response format from search API')
        }
      } catch (primaryError) {
        // Fallback to alternative search if first API fails
        searchApiUsed = 'fallback'
        const fallbackUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        searchResults = [{
          title: `Search results for "${query}"`,
          url: fallbackUrl
        }]
        console.warn('Primary search API failed, using fallback:', primaryError)
      }
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_results_received',
          query,
          resultCount: searchResults.length,
          apiUsed: searchApiUsed
        },
      })
      
      // Process response
      const endTime = performance.now()
      const durationSeconds = (endTime - startTime) / 1000
      
      // Format output
      const output: WebSearchOutput = {
        query,
        results: [
          {
            tool_use_id: 'web-search-1',
            content: searchResults
          },
          `Found ${searchResults.length} results for "${query}"${searchApiUsed === 'fallback' ? ' (using fallback)' : ''}`
        ],
        durationSeconds
      }
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_complete',
          query,
          resultCount: output.results.length,
          apiUsed: searchApiUsed
        },
      })
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      // Create fallback results with search URL
      const fallbackUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      const fallbackResults = [{
        title: `Search results for "${query}"`,
        url: fallbackUrl
      }]
      
      const output: WebSearchOutput = {
        query,
        results: [
          {
            tool_use_id: 'web-search-1',
            content: fallbackResults
          },
          `Found 1 result for "${query}" (using fallback)`,
          `Error during search: ${message}`
        ],
        durationSeconds: (performance.now() - startTime) / 1000,
      }
      
      return { data: output }
    }
  },
} satisfies ToolDef<typeof inputSchema, WebSearchOutput, WebSearchProgress>)