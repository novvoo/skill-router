/**
 * Bing-based search adapter — fetches Bing search pages and extracts
 * search results using regex pattern matching on raw HTML.
 */

import axios from 'axios'
import he from 'he'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const FETCH_TIMEOUT_MS = 10_000

/**
 * Decode HTML entities using the 'he' library
 */
const decodeHtmlEntities = he.decode

/**
 * Generate random hex string
 */
function generateHex(length: number): string {
  let result = ''
  const characters = '0123456789ABCDEF'
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

/**
 * Generate random Chrome version
 */
function generateChromeVersion(): string {
  const major = Math.floor(Math.random() * 10) + 140 // 140-149
  const minor = Math.floor(Math.random() * 10000)
  return `${major}.0.${minor}.${Math.floor(Math.random() * 255)}`
}

/**
 * Generate random screen resolution
 */
function generateScreenResolution(): { width: number; height: number } {
  const widths = [1920, 1366, 1536, 1440, 1280]
  const width = widths[Math.floor(Math.random() * widths.length)]
  const height = Math.floor(width * 9 / 16) // 16:9 aspect ratio
  return { width, height }
}

/**
 * Browser header type definition
 */
type BrowserHeaders = {
  'User-Agent': string
  'Accept': string
  'Accept-Language': string
  'Accept-Encoding': string
  'Cache-Control': string
  'Pragma': string
  'Sec-Ch-Ua': string
  'Sec-Ch-Ua-Arch': string
  'Sec-Ch-Ua-Bitness': string
  'Sec-Ch-Ua-Full-Version': string
  'Sec-Ch-Ua-Full-Version-List': string
  'Sec-Ch-Ua-Mobile': string
  'Sec-Ch-Ua-Model': string
  'Sec-Ch-Ua-Platform': string
  'Sec-Ch-Ua-Platform-Version': string
  'Sec-Fetch-Dest': string
  'Sec-Fetch-Mode': string
  'Sec-Fetch-Site': string
  'Sec-Fetch-User': string
  'Upgrade-Insecure-Requests': string
  'Referer': string
}

/**
 * Generate dynamic browser headers (fingerprint)
 */
function generateBrowserHeaders(): BrowserHeaders {
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

/**
 * Generate dynamic cookies for Bing search
 */
function generateCookies(): Record<string, string> {
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

/**
 * Browser-like headers to avoid Bing's anti-bot JS-rendered response.
 * These mimic Google Chrome on Windows to get full HTML search results.
 */
const BROWSER_HEADERS: BrowserHeaders = generateBrowserHeaders()

/**
 * Default cookies for Bing search to get personalized results
 */
const DEFAULT_COOKIES: Record<string, string> = generateCookies()

export class BingSearchAdapter implements WebSearchAdapter {
  async search(
    query: string,
    options: SearchOptions,
  ): Promise<SearchResult[]> {
    const { signal, onProgress, allowedDomains, blockedDomains } = options

    onProgress?.({ type: 'query_update', query })

    // 检测查询语言，设置相应的市场和语言
    const isChinese = /[\u4e00-\u9fa5]/.test(query)
    const market = isChinese ? 'zh-CN' : 'en-US'
    const language = isChinese ? 'zh-CN' : 'en-US'
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setmkt=${market}&setlang=${language}`

    const abortController = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), { once: true })
    }

    let html: string
    try {
      // 动态生成浏览器指纹和cookies
      const dynamicHeaders = generateBrowserHeaders()
      const dynamicCookies = generateCookies()
      
      // 构建cookie字符串
      const cookieString = Object.entries(dynamicCookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ')
      
      console.log(`[BingSearch] Fetching: ${url}`)
      
      const response = await axios.get(url, {
        signal: abortController.signal,
        timeout: FETCH_TIMEOUT_MS,
        responseType: 'text',
        headers: {
          ...dynamicHeaders,
          'Cookie': cookieString,
        },
        maxRedirects: 5, // 支持最多5次跳转
      })
      html = response.data
      console.log(`[BingSearch] Fetched successfully, content length: ${html.length}`)
    } catch (e) {
      if (axios.isCancel(e) || abortController.signal.aborted) {
        console.log('[BingSearch] Search aborted')
        throw new Error('Search aborted')
      }
      console.error('[BingSearch] Error fetching:', e)
      // 提供更友好的错误信息
      let errorMessage = 'Network error'
      if (axios.isAxiosError(e)) {
        if (e.code === 'ECONNABORTED') {
          errorMessage = `Request timed out after ${FETCH_TIMEOUT_MS}ms`
        } else if (e.response) {
          errorMessage = `HTTP ${e.response.status}: ${e.response.statusText}`
        } else if (e.request) {
          errorMessage = 'No response received from server'
        }
      }
      throw new Error(errorMessage)
    }

    const rawResults = extractBingResults(html)

    // Client-side domain filtering
    const results = rawResults.filter((r) => {
      if (!r.url) return false
      try {
        const hostname = new URL(r.url).hostname
        if (allowedDomains?.length && !allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return false
        }
        if (blockedDomains?.length && blockedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return false
        }
      } catch {
        return false
      }
      return true
    })

    onProgress?.({
      type: 'search_results_received',
      resultCount: results.length,
      query,
    })

    return results
  }
}

/**
 * Extract organic search results from Bing HTML.
 * Bing results live in <li class="b_algo"> blocks within <ol id="b_results">.
 */
export function extractBingResults(html: string): SearchResult[] {
  const results: SearchResult[] = []

  const algoBlockRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = algoBlockRegex.exec(html)) !== null) {
    const block = blockMatch[1]

    // Extract the primary link from <h2><a href="...">...</a></h2>
    const h2LinkRegex = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    const linkMatch = h2LinkRegex.exec(block)
    if (!linkMatch) continue

    const rawUrl = decodeHtmlEntities(linkMatch[1])
    const titleHtml = linkMatch[2]

    // Resolve Bing redirect URLs (bing.com/ck/a?...&u=a1aHR0cHM6Ly9...)
    // or skip Bing-internal / relative links
    const url = resolveBingUrl(rawUrl)
    if (!url) continue

    const title = decodeHtmlEntities(
      titleHtml.replace(/<[^>]+>/g, '').trim(),
    )

    // Extract snippet: try b_lineclamp → b_caption <p> → b_caption fallback
    const snippet = extractSnippet(block)

    results.push({ title, url, snippet })
  }

  return results
}

function extractSnippet(block: string): string | undefined {
  // 1. Try <p class="b_lineclamp...">
  const lineclampRegex = /<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  let match = lineclampRegex.exec(block)
  if (match) {
    return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim())
  }

  // 2. Try <p> inside b_caption
  const captionPRegex = /<div[^>]*class="b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
  match = captionPRegex.exec(block)
  if (match) {
    return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim())
  }

  // 3. Fallback: any text inside b_caption <div>
  const fallbackRegex = /<div[^>]*class="b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const fallbackMatch = fallbackRegex.exec(block)
  if (fallbackMatch) {
    const text = fallbackMatch[1].replace(/<[^>]+>/g, '').trim()
    if (text) return decodeHtmlEntities(text)
  }

  return undefined
}

/**
 * Resolve a Bing redirect URL to the actual target URL.
 * Bing uses URLs like: https://www.bing.com/ck/a?...&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbQ...
 * The `u` query parameter is a base64-encoded URL prefixed with a1 (https) or a0 (http).
 * Returns `undefined` for Bing-internal or relative links that should be skipped.
 */
export function resolveBingUrl(rawUrl: string): string | undefined {
  // Skip relative / anchor links
  if (rawUrl.startsWith('/') || rawUrl.startsWith('#')) return undefined

  // Try to extract the `u` parameter from Bing redirect URLs
  const uMatch = rawUrl.match(/[?&]u=([a-zA-Z0-9+/_=-]+)/)
  if (uMatch) {
    const encoded = uMatch[1]
    if (encoded.length >= 3) {
      const prefix = encoded.slice(0, 2)
      const b64 = encoded.slice(2)
      try {
        // Base64url decode (pad as needed)
        const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        if (decoded.startsWith('http')) return decoded
      } catch {
        // Fall through — not a valid base64 redirect
      }
    }
  }

  // Direct external URL (not a Bing-internal page)
  if (!rawUrl.includes('bing.com')) return rawUrl

  return undefined
}
