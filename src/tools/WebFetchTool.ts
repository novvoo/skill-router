import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'

const inputSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content').optional(),
})

const outputSchema = z.object({
  bytes: z.number().describe('Size of the fetched content in bytes'),
  code: z.number().describe('HTTP response code'),
  codeText: z.string().describe('HTTP response code text'),
  result: z.string().describe('Processed result from the content'),
  durationMs: z.number().describe('Time taken to fetch and process the content'),
  url: z.string().describe('The URL that was fetched'),
})

export type WebFetchInput = z.infer<typeof inputSchema>
export type WebFetchOutput = z.infer<typeof outputSchema>

// Preapproved hosts that don't require permission prompts
const PREAPPROVED_HOSTS = [
  'github.com',
  'docs.python.org',
  'developer.mozilla.org',
  'stackoverflow.com',
  'npmjs.com',
  'pypi.org',
  'wikipedia.org',
  'w3.org',
  'mozilla.org',
  'nodejs.org',
]

function isPreapprovedHost(hostname: string): boolean {
  return PREAPPROVED_HOSTS.some(host => {
    if (host.includes('*')) {
      return new RegExp(host.replace(/\*/g, '.*')).test(hostname)
    }
    return hostname === host || hostname.endsWith('.' + host)
  })
}

async function fetchUrlContent(url: string, signal?: AbortSignal): Promise<{
  content: string
  bytes: number
  code: number
  codeText: string
  contentType: string
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
  
  const combinedSignal = signal ? 
    AbortSignal.any([signal, controller.signal]) : 
    controller.signal

  try {
    const response = await fetch(url, {
      signal: combinedSignal,
      headers: {
        'User-Agent': 'SkillRouter/1.0 (Web Content Fetcher)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
    })

    clearTimeout(timeoutId)

    const bytes = parseInt(response.headers.get('content-length') || '0')
    const contentType = response.headers.get('content-type') || 'text/plain'
    
    if (!response.ok) {
      return {
        content: `HTTP Error ${response.status}: ${response.statusText}`,
        bytes: 0,
        code: response.status,
        codeText: response.statusText,
        contentType,
      }
    }

    const text = await response.text()
    
    return {
      content: text,
      bytes: bytes || text.length,
      code: response.status,
      codeText: response.statusText,
      contentType,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function extractTextContent(html: string, contentType: string): string {
  // Simple text extraction for HTML content
  if (contentType.includes('text/html')) {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ')
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
    text = text.replace(/&amp;/g, '&')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#39;/g, "'")
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim()
    
    return text
  }
  
  return html
}

async function applyPromptToContent(
  prompt: string | undefined,
  content: string,
  signal?: AbortSignal
): Promise<string> {
  if (!prompt) {
    return content
  }
  
  // For now, just return the content with a note about the prompt
  // In a full implementation, this would use an LLM to process the content
  return `Content processed with prompt: "${prompt}"\n\n${content}`
}

export const WebFetchTool = buildTool({
  name: 'web_fetch',
  searchHint: 'fetch and extract content from a URL',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  
  async description(input) {
    try {
      const hostname = new URL(input.url).hostname
      return `Fetch content from ${hostname}`
    } catch {
      return 'Fetch content from URL'
    }
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
    return 'Web Fetch'
  },
  
  getToolUseSummary(input) {
    if (!input?.url) return null
    try {
      const hostname = new URL(input.url).hostname
      return hostname
    } catch {
      return 'URL'
    }
  },
  
  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary ? `Fetching ${summary}` : 'Fetching web page'
  },
  
  async checkPermissions(input, context) {
    try {
      const { url } = input
      const parsedUrl = new URL(url)
      
      if (isPreapprovedHost(parsedUrl.hostname)) {
        return {
          behavior: 'allow',
          updatedInput: input,
        }
      }
    } catch {
      // If URL parsing fails, continue with normal permission checks
    }
    
    return {
      behavior: 'ask',
      message: `Allow fetching content from ${input.url}?`,
      suggestions: [
        {
          type: 'allow_once',
          label: 'Allow once',
        },
        {
          type: 'allow_domain',
          label: 'Allow this domain',
        },
      ],
    }
  },
  
  async validateInput(input) {
    const { url } = input
    try {
      new URL(url)
    } catch {
      return {
        result: false,
        message: `Invalid URL: ${url}`,
        errorCode: 1,
      }
    }
    return { result: true }
  },
  
  async call({ url, prompt }, context, onProgress) {
    const start = Date.now()
    
    onProgress?.({
      toolUseID: 'web-fetch',
      data: {
        type: 'fetch_start',
        url,
      },
    })
    
    try {
      const response = await fetchUrlContent(url, context.abortController.signal)
      
      onProgress?.({
        toolUseID: 'web-fetch',
        data: {
          type: 'fetch_complete',
          bytes: response.bytes,
          code: response.code,
        },
      })
      
      // Extract text content if HTML
      const extractedContent = extractTextContent(response.content, response.contentType)
      
      // Apply prompt if provided
      const result = await applyPromptToContent(
        prompt,
        extractedContent,
        context.abortController.signal
      )
      
      const output: WebFetchOutput = {
        bytes: response.bytes,
        code: response.code,
        codeText: response.codeText,
        result,
        durationMs: Date.now() - start,
        url,
      }
      
      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      const output: WebFetchOutput = {
        bytes: 0,
        code: 0,
        codeText: 'Error',
        result: `Failed to fetch content: ${message}`,
        durationMs: Date.now() - start,
        url,
      }
      
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, WebFetchOutput>)