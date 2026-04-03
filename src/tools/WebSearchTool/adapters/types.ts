/**
 * Web search adapter types
 */

export interface SearchResult {
  title: string
  url: string
  snippet?: string
}

export interface SearchOptions {
  signal?: AbortSignal
  onProgress?: (progress: SearchProgress) => void
  allowedDomains?: string[]
  blockedDomains?: string[]
}

export interface SearchProgress {
  type: 'search_start' | 'search_results_received' | 'search_complete' | 'query_update'
  query?: string
  resultCount?: number
}

export interface WebSearchAdapter {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>
}
