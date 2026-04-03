import { WebFetchTool } from './WebFetchTool.js'
import { WebSearchTool } from './WebSearchTool.js'
import { FileReadTool } from './FileReadTool.js'
import { FileWriteTool } from './FileWriteTool.js'
import { FileEditTool } from './FileEditTool.js'
import { BashTool } from './BashTool.js'
import { GlobTool } from './GlobTool.js'
import { GrepTool } from './GrepTool.js'
import { AskUserQuestionTool } from './AskUserQuestionTool.js'
import { TerminalTool } from './TerminalTool.js'
import { AgentTool } from '../agents/AgentTool.js'
import type { Tools } from './Tool.js'

/**
 * Get all available tools
 */
export function getAllTools(): Tools {
  return [
    // Agent management
    AgentTool,
    
    // File operations
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    
    // Search tools
    GlobTool,
    GrepTool,
    
    // System interaction
    BashTool,
    TerminalTool,
    
    // Network tools
    WebFetchTool,
    WebSearchTool,
    
    // User interaction
    AskUserQuestionTool,
  ]
}

/**
 * Get tools filtered by permissions and enabled status
 */
export function getEnabledTools(): Tools {
  return getAllTools().filter(tool => tool.isEnabled())
}

export * from './Tool.js'
export * from './ToolExecutor.js'
export * from './WebFetchTool.js'
export * from './WebSearchTool.js'
export * from './FileReadTool.js'
export * from './FileWriteTool.js'
export * from './FileEditTool.js'
export * from './BashTool.js'
export * from './TerminalTool.js'
export * from './GlobTool.js'
export * from './GrepTool.js'
export * from './AskUserQuestionTool.js'
export * from '../agents/AgentTool.js'