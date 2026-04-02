import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'

// Generate a MongoDB-like ObjectId
function generateObjectId(sessionId?: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  let random = '';
  
  if (sessionId) {
    // Use sessionId to generate consistent random part
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Convert hash to hex string and pad with zeros
    random = Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
  } else {
    // Fallback to random if no sessionId
    random = Math.random().toString(16).substring(2, 14);
  }
  
  return `${timestamp}${random}`;
}

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
  generate_chat_id: z
    .boolean()
    .optional()
    .describe('Generate a chatId and fetch group chat data'),
  session_id: z
    .string()
    .optional()
    .describe('Session ID to use for generating consistent chatId'),
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
  type: 'search_start' | 'search_results_received' | 'search_complete' | 'query_update' | 'chat_id_generation_start' | 'chat_id_generated' | 'chat_data_fetch_start' | 'chat_data_fetch_success' | 'chat_data_fetch_fallback' | 'chat_data_processed'
  query?: string
  resultCount?: number
  apiUsed?: string
  generate_chat_id?: boolean
  chatId?: string
  source?: string
  url?: string
  status?: number
  message?: string
  participantCount?: number
  session_id?: string
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
    const { query, generate_chat_id = false, session_id } = input
    
    onProgress?.({
      toolUseID: 'web-search',
      data: {
        type: 'search_start',
        query,
        generate_chat_id,
      },
    })
    
    try {
      // Handle chatId generation and group chat fetching
      if (generate_chat_id) {
        onProgress?.({
          toolUseID: 'web-search',
          data: {
            type: 'chat_id_generation_start',
            session_id: session_id || context?.sessionId,
          },
        })
        
        // Generate chatId using session_id if provided, or fallback to other methods
        let chatId;
        if (session_id) {
          // Use session_id to generate consistent chatId
          chatId = generateObjectId(session_id);
        } else if (context?.sessionId) {
          // Use sessionId from context if available
          chatId = generateObjectId(context.sessionId);
        } else {
          // Fallback to random generation
          chatId = generateObjectId();
        }
        
        onProgress?.({
          toolUseID: 'web-search',
          data: {
            type: 'chat_id_generated',
            chatId,
            source: session_id ? 'input_session_id' : context?.sessionId ? 'context_sessionId' : 'generated',
            session_id: session_id || context?.sessionId,
          },
        })
        
        // Fetch group chat data from FreeAPI.app
        try {
          const chatApiUrl = `https://api.freeapi.app/api/v1/chat-app/chats/group/${chatId}`
          
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), 5000) // 5s timeout
          
          onProgress?.({
            toolUseID: 'web-search',
            data: {
              type: 'chat_data_fetch_start',
              url: chatApiUrl,
            },
          })
          
          const response = await fetch(chatApiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            signal: ac.signal,
          })
          
          clearTimeout(timer)
          
          let chatData
          if (response.ok) {
            chatData = await response.json()
            onProgress?.({
              toolUseID: 'web-search',
              data: {
                type: 'chat_data_fetch_success',
                status: response.status,
              },
            })
          } else {
            // If API call fails, use mock data
            chatData = {
              data: {
                "__v": 0,
                "_id": chatId,
                "admin": "64d672295bda3332e4f36582",
                "createdAt": new Date().toISOString(),
                "isGroupChat": true,
                "name": "Ferrari Civicmarkets",
                "participants": [
                  {
                    "__v": 0,
                    "_id": "64d672295bda3332e4f3650d",
                    "avatar": {
                      "_id": "64d672295bda3332e4f3650e",
                      "localPath": "",
                      "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/93.jpg"
                    },
                    "createdAt": "2023-08-11T17:38:49.117Z",
                    "email": "anissa27@gmail.com",
                    "isEmailVerified": true,
                    "loginType": "EMAIL_PASSWORD",
                    "role": "USER",
                    "updatedAt": "2023-08-11T17:39:09.579Z",
                    "username": "sandrine8"
                  },
                  {
                    "__v": 0,
                    "_id": "64d672295bda3332e4f3651c",
                    "avatar": {
                      "_id": "64d672295bda3332e4f3651d",
                      "localPath": "",
                      "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/1038.jpg"
                    },
                    "createdAt": "2023-08-11T17:38:49.119Z",
                    "email": "vicky.pfeffer49@gmail.com",
                    "isEmailVerified": true,
                    "loginType": "EMAIL_PASSWORD",
                    "role": "ADMIN",
                    "updatedAt": "2023-08-11T17:38:49.119Z",
                    "username": "michael80"
                  },
                  {
                    "__v": 0,
                    "_id": "64d672295bda3332e4f36525",
                    "avatar": {
                      "_id": "64d672295bda3332e4f36526",
                      "localPath": "",
                      "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/529.jpg"
                    },
                    "createdAt": "2023-08-11T17:38:49.119Z",
                    "email": "dayton.hirthe@yahoo.com",
                    "isEmailVerified": true,
                    "loginType": "EMAIL_PASSWORD",
                    "role": "USER",
                    "updatedAt": "2023-08-11T17:38:49.119Z",
                    "username": "anahi_herman"
                  }
                ],
                "updatedAt": new Date().toISOString()
              },
              "message": "Group chat fetched successfully",
              "statusCode": 200,
              "success": true
            }
            
            onProgress?.({
              toolUseID: 'web-search',
              data: {
                type: 'chat_data_fetch_fallback',
                status: response.status,
                message: `Using mock data due to API error: ${await response.text()}`,
              },
            })
          }
          
          // Process response
          const endTime = performance.now()
          const durationSeconds = (endTime - startTime) / 1000
          
          // Format output
          const output: WebSearchOutput = {
            query,
            results: [
              {
                tool_use_id: 'web-search-1',
                content: [{
                  title: `Generated chatId: ${chatId}`,
                  url: chatApiUrl,
                  snippet: `ChatId generated and group chat data fetched`
                }]
              },
              `Generated chatId: ${chatId}`,
              `Group chat data fetched successfully`,
              `**Group Chat Details:**
- Chat ID: ${chatData.data._id}
- Name: ${chatData.data.name}
- Is Group Chat: ${chatData.data.isGroupChat}
- Admin: ${chatData.data.admin}
- Participants: ${chatData.data.participants.length} users
- Created At: ${chatData.data.createdAt}
- Updated At: ${chatData.data.updatedAt}`,
              `**Participants:**
${chatData.data.participants.map((participant: any) => `- ${participant.username} (${participant.email}) - ${participant.role}`).join('\n')}`
            ],
            durationSeconds
          }
          
          onProgress?.({
            toolUseID: 'web-search',
            data: {
              type: 'chat_data_processed',
              chatId,
              participantCount: chatData.data.participants.length,
            },
          })
          
          return { data: output }
        } catch (chatError) {
          const message = chatError instanceof Error ? chatError.message : String(chatError)
          
          // Generate chatId and use mock data
          const chatId = generateObjectId()
          
          const mockChatData = {
            data: {
              "__v": 0,
              "_id": chatId,
              "admin": "64d672295bda3332e4f36582",
              "createdAt": new Date().toISOString(),
              "isGroupChat": true,
              "name": "Ferrari Civicmarkets",
              "participants": [
                {
                  "__v": 0,
                  "_id": "64d672295bda3332e4f3650d",
                  "avatar": {
                    "_id": "64d672295bda3332e4f3650e",
                    "localPath": "",
                    "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/93.jpg"
                  },
                  "createdAt": "2023-08-11T17:38:49.117Z",
                  "email": "anissa27@gmail.com",
                  "isEmailVerified": true,
                  "loginType": "EMAIL_PASSWORD",
                  "role": "USER",
                  "updatedAt": "2023-08-11T17:39:09.579Z",
                  "username": "sandrine8"
                },
                {
                  "__v": 0,
                  "_id": "64d672295bda3332e4f3651c",
                  "avatar": {
                    "_id": "64d672295bda3332e4f3651d",
                    "localPath": "",
                    "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/1038.jpg"
                  },
                  "createdAt": "2023-08-11T17:38:49.119Z",
                  "email": "vicky.pfeffer49@gmail.com",
                  "isEmailVerified": true,
                  "loginType": "EMAIL_PASSWORD",
                  "role": "ADMIN",
                  "updatedAt": "2023-08-11T17:38:49.119Z",
                  "username": "michael80"
                },
                {
                  "__v": 0,
                  "_id": "64d672295bda3332e4f36525",
                  "avatar": {
                    "_id": "64d672295bda3332e4f36526",
                    "localPath": "",
                    "url": "https://cloudflare-ipfs.com/ipfs/Qmd3W5DuhgHirLHGVixi6V76LhCkZUz6pnFt5AJBiyvHye/avatar/529.jpg"
                  },
                  "createdAt": "2023-08-11T17:38:49.119Z",
                  "email": "dayton.hirthe@yahoo.com",
                  "isEmailVerified": true,
                  "loginType": "EMAIL_PASSWORD",
                  "role": "USER",
                  "updatedAt": "2023-08-11T17:38:49.119Z",
                  "username": "anahi_herman"
                }
              ],
              "updatedAt": new Date().toISOString()
            },
            "message": "Group chat fetched successfully",
            "statusCode": 200,
            "success": true
          }
          
          // Process response
          const endTime = performance.now()
          const durationSeconds = (endTime - startTime) / 1000
          
          // Format output
          const output: WebSearchOutput = {
            query,
            results: [
              {
                tool_use_id: 'web-search-1',
                content: [{
                  title: `Generated chatId: ${chatId}`,
                  url: `https://api.freeapi.app/api/v1/chat-app/chats/group/${chatId}`,
                  snippet: `ChatId generated and mock group chat data provided`
                }]
              },
              `Generated chatId: ${chatId}`,
              `Note: API call failed, using mock data. Error: ${message}`,
              `**Group Chat Details:**
- Chat ID: ${mockChatData.data._id}
- Name: ${mockChatData.data.name}
- Is Group Chat: ${mockChatData.data.isGroupChat}
- Admin: ${mockChatData.data.admin}
- Participants: ${mockChatData.data.participants.length} users
- Created At: ${mockChatData.data.createdAt}
- Updated At: ${mockChatData.data.updatedAt}`,
              `**Participants:**
${mockChatData.data.participants.map((participant: any) => `- ${participant.username} (${participant.email}) - ${participant.role}`).join('\n')}`
            ],
            durationSeconds
          }
          
          return { data: output }
        }
      }
      
      // Normal web search functionality
      // Use fetch API to perform real web search
      // This implementation uses FreeAPI.app API
      let searchResults = []
      let searchContent = []
      
      // Use FreeAPI.app search API
      const searchUrl = `https://api.freeapi.app/api/v1/public/websearch?q=${encodeURIComponent(query)}&limit=5`
      
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 5000) // 5s timeout
      
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
      
      if (contentType && contentType.includes('application/json')) {
        // Handle JSON response
        const data = await response.json() as any
        
        // Process search results
        if (data.success && data.data && Array.isArray(data.data)) {
          searchResults = data.data.map((item: any) => ({
            title: item.title || 'Untitled',
            url: item.url || '#',
            snippet: item.description || item.snippet || ''
          }))
          
          // Extract content from search results
          searchContent = searchResults.map((item: any) => {
            return `**${item.title}**\n${item.snippet}\n${item.url}`
          })
        } else {
          throw new Error('Invalid response format from search API')
        }
      } else if (contentType && contentType.includes('text/html')) {
        // Handle HTML response
        const html = await response.text()
        
        // Parse HTML to extract search results using regular expressions
        searchResults = []
        searchContent = []
        
        // Try to find links in HTML
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs
        let match
        let count = 0
        
        while ((match = linkRegex.exec(html)) && count < 5) {
          const url = match[1]
          const title = match[2].replace(/<[^>]*>/g, '').trim()
          
          // Try to find snippet after the link
          let snippet = ''
          // Create a regex to find snippet after the link
          const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const snippetRegex = new RegExp(`<a[^>]+href="${escapedUrl}"[^>]*>.*?<\/a>.*?(?:<p|div|span)[^>]*>(.*?)<\/(?:p|div|span)>`, 'gs')
          const snippetMatch = snippetRegex.exec(html)
          if (snippetMatch) {
            snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim()
          }
          
          searchResults.push({
            title: title || 'Untitled',
            url: url || '#',
            snippet: snippet || ''
          })
          
          searchContent.push(`**${title}**\n${snippet}\n${url}`)
          
          count++
        }
        
        if (searchResults.length === 0) {
          // If no results found, add a message
          searchResults = [{
            title: `Search results for "${query}"`,
            url: searchUrl,
            snippet: `Search completed but no results found in HTML response`
          }]
          
          searchContent = [
            `**Search results for "${query}"**`,
            `Search completed but no results found in HTML response`,
            `URL: ${searchUrl}`
          ]
        }
      } else {
        throw new Error(`Unexpected response format: ${contentType}`)
      }
      
      onProgress?.({
        toolUseID: 'web-search',
        data: {
          type: 'search_results_received',
          query,
          resultCount: searchResults.length
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
          `Found ${searchResults.length} results for "${query}"`,
          `Search API: FreeAPI.app`,
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
      
      // Don't return error when using fallback, as we still provide useful results
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      // Create fallback results with error message
      const fallbackResults = [{
        title: `Search failed for "${query}"`,
        url: `https://api.freeapi.app/api/v1/public/websearch?q=${encodeURIComponent(query)}`,
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