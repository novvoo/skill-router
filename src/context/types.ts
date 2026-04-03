
export enum ContextLevel {
  L0 = "L0", // Metadata only
  L1 = "L1", // Summary/Abstract
  L2 = "L2", // Full Content
}

export enum ContextType {
  Memory = "memory",
  Resource = "resource",
  Skill = "skill",
  Session = "session",
  Directory = "directory",
}

export interface ContextNode {
  path: string; // Virtual path like /user/memories/preferences
  type: ContextType;
  metadata: Record<string, any>;
  summary?: string;
  content?: string;
  children?: ContextNode[];
  level: ContextLevel; // Current loaded level
  score?: number; // Relevance score
}

export interface RetrievalOptions {
  query: string;
  maxResults?: number;
  minScore?: number;
  targetDirectories?: string[]; // Limit search to specific virtual directories
  fileTypes?: string[]; // Limit search to specific file types
  sortBy?: 'relevance' | 'date' | 'name'; // Sort results by different criteria
  caseSensitive?: boolean; // Case sensitivity for keyword search
  phraseSearch?: boolean; // Enable phrase search
  excludePaths?: string[]; // Exclude specific paths from search
}

export interface RetrievalResult {
  nodes: ContextNode[];
  trajectory: string[]; // Log of retrieval steps for observability
}
