import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import { createAdapter } from './WebSearchTool/adapters/index.js'

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
  snippet: z.string().optional().describe('A snippet of the search result'),
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
  apiUsed?: string
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
      // Web search functionality using BingSearchAdapter
      const adapter = createAdapter()
      const adapterResults = await adapter.search(query, {
        allowedDomains: input.allowed_domains,
        blockedDomains: input.blocked_domains,
        signal: context?.abortController?.signal,
        onProgress(progress) {
          if (onProgress) {
            onProgress({
              toolUseID: 'web-search',
              data: progress,
            })
          }
        },
      })
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_results_received',
          query,
          resultCount: adapterResults.length
        },
      })
      
      // Process response
      const endTime = performance.now()
      const durationSeconds = (endTime - startTime) / 1000
      
      // Extract content from search results
      const searchContent = adapterResults.map((item: any) => {
        return `**${item.title}**\n${item.snippet || ''}\n${item.url}`
      })
      
      // Format output
      const output: WebSearchOutput = {
        query,
        results: [
          {
            tool_use_id: 'web-search',
            content: adapterResults
          },
          `Found ${adapterResults.length} results for "${query}"`,
          `Search API: Bing`,
          ...searchContent
        ],
        durationSeconds
      }
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_complete',
          query,
          resultCount: output.results.length
        },
      })
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      // Create fallback results with error message
      const fallbackResults = [{
        title: `Search failed for "${query}"`,
        url: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Search API failed: ${message}`
      }]
      
      const searchContent = [
        `**Search failed for "${query}"**`,
        `Error during search: ${message}`,
        `Please try again later or check your network connection.`
      ]
      
      const output: WebSearchOutput = {
        query,
        results: [
          {
            tool_use_id: 'web-search-1',
            content: fallbackResults
          },
          `Search failed for "${query}"`,
          ...searchContent
        ],
        durationSeconds: (performance.now() - startTime) / 1000,
      }
      
      return { data: output }
    }
  },
} satisfies ToolDef<typeof inputSchema, WebSearchOutput, WebSearchProgress>)
