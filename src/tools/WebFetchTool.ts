import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'
import axios from 'axios'

const FETCH_TIMEOUT_MS = 30_000

function generateHex(length: number): string {
  let result = ''
  const characters = '0123456789ABCDEF'
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

function generateChromeVersion(): string {
  const major = Math.floor(Math.random() * 10) + 140
  const minor = Math.floor(Math.random() * 10000)
  return `${major}.0.${minor}.${Math.floor(Math.random() * 255)}`
}

function generateScreenResolution(): { width: number; height: number } {
  const widths = [1920, 1366, 1536, 1440, 1280]
  const width = widths[Math.floor(Math.random() * widths.length)]
  const height = Math.floor(width * 9 / 16)
  return { width, height }
}

function generateBrowserHeaders() {
  const chromeVersion = generateChromeVersion()
  const screen = generateScreenResolution()
  
  return {
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': `"Chromium";v="${chromeVersion.split('.')[0]}", "Not-A.Brand";v="24", "Google Chrome";v="${chromeVersion.split('.')[0]}"`,
    'Sec-Ch-Ua-Arch': '"x86"',
    'Sec-Ch-Ua-Bitness': '"64"',
    'Sec-Ch-Ua-Full-Version': `"${chromeVersion}"`,
    'Sec-Ch-Ua-Full-Version-List': `"Chromium";v="${chromeVersion}", "Not-A.Brand";v="24.0.0.0", "Google Chrome";v="${chromeVersion}"`,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Model': '""',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Ch-Ua-Platform-Version': '"10.0.0"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.bing.com/',
  }
}

function generateCookies() {
  const screen = generateScreenResolution()
  return {
    'MUID': generateHex(32),
    'SRCHD': 'AF=NOFORM',
    'SRCHUID': `V=2&GUID=${generateHex(32)}&dmnchg=1`,
    'SRCHHPGUSR': `SRCHLANG=zh-Hans&PV=10.0.0&BZA=0&PREFCOL=1&BRW=XW&BRH=M&CW=${screen.width}&CH=${screen.height}&SCW=${screen.width}&SCH=${screen.height}&DPR=1.0&UTC=480&B=0&EXLTT=6&AV=14&ADV=14`,
    '_EDGE_S': `SID=${generateHex(32)}&mkt=zh-CN&ui=zh-cn`,
    'USRLOC': 'HS=1&ELOC=LAT=31.201019287109375|LON=121.40116882324219|N=%E9%95%BF%E5%AE%81%E5%8C%BA%EF%BC%8C%E4%B8%8A%E6%B5%B7%E5%B8%82|ELT=4|',
  }
}

const inputSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content').optional(),
  internal: z.boolean().describe('Internal call flag (e.g., from deep search)').optional().default(false),
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
  const abortController = new AbortController()
  if (signal) {
    signal.addEventListener('abort', () => abortController.abort(), { once: true })
  }

  try {
    const dynamicHeaders = generateBrowserHeaders()
    const dynamicCookies = generateCookies()
    
    const cookieString = Object.entries(dynamicCookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')

    const response = await axios.get(url, {
      signal: abortController.signal,
      timeout: FETCH_TIMEOUT_MS,
      responseType: 'text',
      headers: {
        ...dynamicHeaders,
        'Cookie': cookieString,
      },
      maxRedirects: 5,
    })

    const bytes = parseInt(response.headers['content-length'] || '0')
    const contentType = response.headers['content-type'] || 'text/plain'
    
    return {
      content: response.data,
      bytes: bytes || response.data.length,
      code: response.status,
      codeText: response.statusText,
      contentType,
    }
  } catch (error) {
    if (axios.isCancel(error) || abortController.signal.aborted) {
      throw new Error('Fetch aborted')
    }
    if (axios.isAxiosError(error)) {
      return {
        content: `HTTP Error ${error.response?.status || 0}: ${error.response?.statusText || error.message}`,
        bytes: 0,
        code: error.response?.status || 0,
        codeText: error.response?.statusText || error.message,
        contentType: 'text/plain',
      }
    }
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
    // 如果是内部调用（如来自深度搜索），直接允许
    if (input.internal) {
      return {
        behavior: 'allow',
        updatedInput: input,
      }
    }
    
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