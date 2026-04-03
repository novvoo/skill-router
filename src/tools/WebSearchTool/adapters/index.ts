/**
 * Search adapter factory — always returns BingSearchAdapter
 */

import { BingSearchAdapter } from './bingAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type { SearchResult, SearchOptions, SearchProgress, WebSearchAdapter } from './types.js'

let cachedAdapter: WebSearchAdapter | null = null

export function createAdapter(): WebSearchAdapter {
  // Adapter is stateless — safe to reuse across calls within a session
  if (cachedAdapter) return cachedAdapter

  // Always use BingSearchAdapter
  cachedAdapter = new BingSearchAdapter()
  return cachedAdapter
}
