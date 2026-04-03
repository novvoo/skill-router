/**
 * Search adapter factory — returns all available search adapters
 */

import { BingSearchAdapter } from './bingAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type { SearchResult, SearchOptions, SearchProgress, WebSearchAdapter } from './types.js'

let cachedAdapters: Map<string, WebSearchAdapter> | null = null

export function getAdapters(): Map<string, WebSearchAdapter> {
  // Adapters are stateless — safe to reuse across calls within a session
  if (cachedAdapters) return cachedAdapters

  const adapters = new Map<string, WebSearchAdapter>()
  
  // Add Bing search adapter
  adapters.set('bing', new BingSearchAdapter())
  
  // Add more adapters here in the future
  // e.g., adapters.set('google', new GoogleSearchAdapter())
  
  cachedAdapters = adapters
  return cachedAdapters
}

export function getAdapter(name: string = 'bing'): WebSearchAdapter {
  const adapters = getAdapters()
  const adapter = adapters.get(name)
  if (!adapter) {
    throw new Error(`Search adapter not found: ${name}`)
  }
  return adapter
}

export function getAdapterNames(): string[] {
  return Array.from(getAdapters().keys())
}
