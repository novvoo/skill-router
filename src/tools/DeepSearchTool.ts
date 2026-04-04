import { z } from 'zod'
import { buildTool, type ToolDef, findToolByName } from './Tool.js'
import { getAllTools } from './index.js'
import { ToolExecutor, type ToolCall } from './ToolExecutor.js'
import { WebSearchTool, type WebSearchOutput, type SearchResult } from './WebSearchTool.js'
import { WebFetchTool, type WebFetchOutput } from './WebFetchTool.js'

const inputSchema = z.object({
  query: z.string().min(2).describe('The primary search query'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2)
    .optional()
    .describe('Number of search levels (1-5)'),
  maxResultsPerLevel: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .optional()
    .describe('Maximum results to fetch per level'),
  fetchContent: z
    .boolean()
    .default(true)
    .optional()
    .describe('Whether to fetch and extract content from URLs'),
  concurrentRequests: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .optional()
    .describe('Maximum concurrent requests'),
  adapter: z
    .string()
    .default('bing')
    .optional()
    .describe('Search adapter to use'),
  allowed_domains: z
    .array(z.string())
    .optional()
    .describe('Only include search results from these domains'),
  blocked_domains: z
    .array(z.string())
    .optional()
    .describe('Never include search results from these domains'),
})

const deepSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
  content: z.string().optional(),
  level: z.number(),
  parentQuery: z.string().optional(),
})

const outputSchema = z.object({
  query: z.string(),
  levels: z.array(
    z.object({
      level: z.number(),
      query: z.string(),
      results: z.array(deepSearchResultSchema),
    })
  ),
  totalResults: z.number(),
  durationSeconds: z.number(),
  initialSearchOutput: z.any().optional().describe('Full output from initial WebSearch'),
})

export type DeepSearchInput = z.infer<typeof inputSchema>
export type DeepSearchOutput = z.infer<typeof outputSchema>
export type DeepSearchResult = z.infer<typeof deepSearchResultSchema>

export type DeepSearchProgress = {
  type: 'search_start' | 'level_complete' | 'fetch_start' | 'fetch_complete' | 'search_complete'
  level?: number
  query?: string
  resultsCount?: number
  url?: string
  levelResults?: number
}

async function executeWebSearch(
  query: string, 
  adapter: string,
  allowedDomains: string[] | undefined,
  blockedDomains: string[] | undefined,
  context: any
): Promise<{ results: SearchResult[], fullOutput: WebSearchOutput }> {
  console.log(`[DeepSearch] executeWebSearch called with query: "${query}"`)
  
  const toolExecutor = new ToolExecutor(context.config)
  
  const toolCall: ToolCall = {
    id: `web_search_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    name: 'web_search',
    arguments: { query, adapter, allowed_domains: allowedDomains, blocked_domains: blockedDomains }
  }
  
  console.log(`[DeepSearch] Executing web_search tool call`)
  
  const result = await toolExecutor.executeToolCall(toolCall, {
    sessionId: context.sessionId,
    abortController: context.abortController
  })
  
  if (result.error) {
    console.error(`[DeepSearch] web_search failed:`, result.error)
    throw new Error(result.error)
  }
  
  const output = result.result as WebSearchOutput
  console.log(`[DeepSearch] web_search returned ${output.results.length} items`)
  
  const searchResults: SearchResult[] = []
  for (const item of output.results) {
    if (typeof item === 'object' && item !== null && 'content' in item) {
      const content = item.content as SearchResult[]
      searchResults.push(...content)
      console.log(`[DeepSearch] Found ${content.length} search results`)
    }
  }
  
  console.log(`[DeepSearch] Total search results extracted: ${searchResults.length}`)
  return { results: searchResults, fullOutput: output }
}

async function executeWebFetch(
  url: string, 
  context: any
): Promise<string> {
  console.log(`[DeepSearch] executeWebFetch called with url: ${url}`)
  
  const toolExecutor = new ToolExecutor(context.config)
  
  const toolCall: ToolCall = {
    id: `web_fetch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    name: 'web_fetch',
    arguments: { url, internal: true }
  }
  
  console.log(`[DeepSearch] Executing web_fetch tool call for ${url}`)
  
  const result = await toolExecutor.executeToolCall(toolCall, {
    sessionId: context.sessionId,
    abortController: context.abortController
  })
  
  if (result.error) {
    console.error(`[DeepSearch] Failed to fetch ${url}:`, result.error)
    return ''
  }
  
  const output = result.result as WebFetchOutput
  console.log(`[DeepSearch] web_fetch for ${url} completed with status ${output.code}`)
  console.log(`[DeepSearch] Fetched content length: ${output.result.length} characters`)
  
  return output.result
}

async function concurrentLimit<T, R>(
  items: T[], 
  fn: (item: T) => Promise<R>, 
  limit: number
): Promise<R[]> {
  const results: R[] = []
  const executing: Promise<void>[] = []
  let index = 0

  while (index < items.length || executing.length > 0) {
    while (index < items.length && executing.length < limit) {
      const item = items[index]
      const promise = fn(item).then(result => {
        results.push(result)
      })
      executing.push(promise)
      promise.finally(() => {
        const idx = executing.indexOf(promise)
        if (idx > -1) executing.splice(idx, 1)
      })
      index++
    }
    if (executing.length > 0) {
      await Promise.race(executing)
    }
  }
  return results
}

function generateFollowUpQueries(
  baseQuery: string, 
  baseResults: SearchResult[], 
  level: number
): string[] {
  const queries: string[] = []
  const baseTerms = baseQuery.toLowerCase().split(/\s+/)
  
  const keyTerms = new Set<string>()
  
  for (const result of baseResults) {
    const text = (result.title + ' ' + (result.snippet || '')).toLowerCase()
    const words = text.split(/\s+/)
    for (const word of words) {
      if (word.length > 3 && !baseTerms.includes(word)) {
        keyTerms.add(word)
      }
    }
  }
  
  const termsArray = Array.from(keyTerms).slice(0, 5)
  
  if (termsArray.length > 0) {
    queries.push(`${baseQuery} ${termsArray[0]}`)
    if (termsArray.length > 1) {
      queries.push(`${baseQuery} ${termsArray[1]}`)
    }
  }
  
  return queries
}

export const DeepSearchTool = buildTool({
  name: 'deep_search',
  aliases: ['deepSearch'],
  searchHint: 'perform deep, multi-level web search with content extraction',
  maxResultSizeChars: 500_000,
  shouldDefer: true,
  category: 'network',
  tags: ['search', 'deep', 'web', 'multi-level', 'concurrent'],
  
  async description(input) {
    return `Deep search for: ${input.query} (depth: ${input.depth || 2})`
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
    return 'Deep Search'
  },
  
  getToolUseSummary(input) {
    return input?.query || null
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Deep searching for ${summary}` : 'Deep searching the web'
  },
  
  async checkPermissions(_input) {
    return {
      behavior: 'allow',
      updatedInput: _input,
    }
  },
  
  async validateInput(input) {
    const { query } = input
    
    if (!query || !query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      }
    }
    
    if (input.allowed_domains?.length && input.blocked_domains?.length) {
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
    const {
      query,
      depth = 2,
      maxResultsPerLevel = 5,
      fetchContent = true,
      concurrentRequests = 5,
      adapter: adapterName = 'bing',
    } = input
    
    const levels: DeepSearchOutput['levels'] = []
    let allResults: DeepSearchResult[] = []
    let initialWebSearchOutput: WebSearchOutput | undefined
    
    onProgress?.({
      toolUseID: 'deep-search',
      data: {
        type: 'search_start',
        query,
      },
    })
    
    try {
      // 使用 WebSearchTool 进行第一级搜索
      const { results: level1Results, fullOutput } = await executeWebSearch(
        query,
        adapterName,
        input.allowed_domains,
        input.blocked_domains,
        context
      )
      initialWebSearchOutput = fullOutput
      
      const level1DeepResults: DeepSearchResult[] = level1Results
        .slice(0, maxResultsPerLevel)
        .map((result: any) => ({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          level: 1,
          parentQuery: query,
        }))
      
      if (fetchContent) {
        onProgress?.({
          toolUseID: 'deep-search',
          data: {
            type: 'fetch_start',
            level: 1,
          },
        })
        
        const fetchedContents = await concurrentLimit(
          level1DeepResults,
          async (result) => {
            const content = await executeWebFetch(result.url, context)
            onProgress?.({
              toolUseID: 'deep-search',
              data: {
                type: 'fetch_complete',
                url: result.url,
              },
            })
            return { ...result, content }
          },
          concurrentRequests
        )
        
        levels.push({
          level: 1,
          query,
          results: fetchedContents,
        })
        
        allResults = [...fetchedContents]
      } else {
        levels.push({
          level: 1,
          query,
          results: level1DeepResults,
        })
        allResults = [...level1DeepResults]
      }
      
      onProgress?.({
        toolUseID: 'deep-search',
        data: {
          type: 'level_complete',
          level: 1,
          resultsCount: allResults.length,
        },
      })
      
      // 执行后续级别的搜索
      for (let currentLevel = 2; currentLevel <= depth; currentLevel++) {
        const previousLevelResults = levels[currentLevel - 2]
        if (!previousLevelResults) break
        
        const followUpQueries = generateFollowUpQueries(
          query,
          previousLevelResults.results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet || '',
          })),
          currentLevel
        )
        
        const levelResults: DeepSearchResult[] = []
        
        for (const followUpQuery of followUpQueries) {
          // 使用 WebSearchTool 进行后续搜索
          const { results: searchResults } = await executeWebSearch(
            followUpQuery,
            adapterName,
            input.allowed_domains,
            input.blocked_domains,
            context
          )
          
          const deepResults = searchResults
            .slice(0, Math.max(1, Math.floor(maxResultsPerLevel / followUpQueries.length)))
            .map((result: any) => ({
              title: result.title,
              url: result.url,
              snippet: result.snippet,
              level: currentLevel,
              parentQuery: followUpQuery,
            }))
          
          levelResults.push(...deepResults)
        }
        
        const uniqueResults: DeepSearchResult[] = []
        const seenUrls = new Set<string>()
        for (const result of levelResults) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url)
            uniqueResults.push(result)
          }
        }
        
        if (fetchContent) {
          onProgress?.({
            toolUseID: 'deep-search',
            data: {
              type: 'fetch_start',
              level: currentLevel,
            },
          })
          
          const fetchedContents = await concurrentLimit(
            uniqueResults,
            async (result) => {
              const content = await executeWebFetch(result.url, context)
              onProgress?.({
                toolUseID: 'deep-search',
                data: {
                  type: 'fetch_complete',
                  url: result.url,
                },
              })
              return { ...result, content }
            },
            concurrentRequests
          )
          
          levels.push({
            level: currentLevel,
            query: followUpQueries.join('; '),
            results: fetchedContents,
          })
          
          allResults.push(...fetchedContents)
        } else {
          levels.push({
            level: currentLevel,
            query: followUpQueries.join('; '),
            results: uniqueResults,
          })
          allResults.push(...uniqueResults)
        }
        
        onProgress?.({
          toolUseID: 'deep-search',
          data: {
            type: 'level_complete',
            level: currentLevel,
            resultsCount: allResults.length,
          },
        })
      }
      
      const endTime = performance.now()
      const durationSeconds = (endTime - startTime) / 1000
      
      const output: DeepSearchOutput = {
        query,
        levels,
        totalResults: allResults.length,
        durationSeconds,
        initialSearchOutput: initialWebSearchOutput,
      }
      
      onProgress?.({
        toolUseID: 'deep-search',
        data: {
          type: 'search_complete',
          resultsCount: allResults.length,
        },
      })
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: DeepSearchOutput = {
        query,
        levels,
        totalResults: allResults.length,
        durationSeconds: (performance.now() - startTime) / 1000,
        initialSearchOutput: initialWebSearchOutput,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, DeepSearchOutput, DeepSearchProgress>)
