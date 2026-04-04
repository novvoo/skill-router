import type { OpenAIConfig } from '../handler.js'
import {
  getAllTools,
  findToolByName,
  type Tool,
  type ToolUseContext,
  type ToolResult,
} from './index.js'
import { z } from 'zod'

// ==================== 类型定义 ====================

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolCallResult = {
  id: string
  name: string
  result: unknown
  error?: string
  duration: number
}

export type ToolExecutionProgress = {
  stage: 'tool_start' | 'tool_progress' | 'tool_complete' | 'tool_error'
  toolId: string
  toolName: string
  message: string
  data?: any
}

export type RetryPolicy = {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors: Set<string>
}

export type CachePolicy = {
  enabled: boolean
  ttlMs: number
  maxEntries: number
}

export type ToolMetrics = {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalDurationMs: number
  avgDurationMs: number
  retries: number
  cacheHits: number
  cacheMisses: number
}

export type AuditLogEntry = {
  id: string
  timestamp: number
  toolName: string
  toolCallId: string
  sessionId?: string
  input: Record<string, unknown>
  output?: unknown
  error?: string
  durationMs: number
  status: 'success' | 'error' | 'cached'
  retryCount: number
}

export type ToolExecutorConfig = {
  retryPolicy?: Partial<RetryPolicy>
  cachePolicy?: Partial<CachePolicy>
  defaultTimeoutMs?: number
  enableMetrics?: boolean
  enableAudit?: boolean
  maxConcurrentTools?: number
}

// ==================== 默认配置 ====================

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'network error',
    'timeout',
    'rate limit',
    'too many requests',
    '500',
    '502',
    '503',
    '504',
  ]),
}

const DEFAULT_CACHE_POLICY: CachePolicy = {
  enabled: true,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
}

const DEFAULT_CONFIG: ToolExecutorConfig = {
  retryPolicy: DEFAULT_RETRY_POLICY,
  cachePolicy: DEFAULT_CACHE_POLICY,
  defaultTimeoutMs: 60000, // 60 seconds
  enableMetrics: true,
  enableAudit: true,
  maxConcurrentTools: 5,
}

// ==================== 工具缓存 ====================

class ToolCache {
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map()
  private policy: CachePolicy

  constructor(policy: CachePolicy) {
    this.policy = policy
  }

  private generateKey(toolName: string, input: Record<string, unknown>): string {
    const sortedInput = Object.keys(input)
      .sort()
      .reduce((obj, key) => {
        obj[key] = input[key]
        return obj
      }, {} as Record<string, unknown>)
    return `${toolName}:${JSON.stringify(sortedInput)}`
  }

  get(toolName: string, input: Record<string, unknown>): unknown | undefined {
    if (!this.policy.enabled) return undefined

    const key = this.generateKey(toolName, input)
    const entry = this.cache.get(key)

    if (entry && entry.expiresAt > Date.now()) {
      return entry.data
    }

    if (entry) {
      this.cache.delete(key)
    }

    return undefined
  }

  set(toolName: string, input: Record<string, unknown>, data: unknown): void {
    if (!this.policy.enabled) return

    this.cleanup()

    const key = this.generateKey(toolName, input)
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.policy.ttlMs,
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key)
      }
    }

    while (this.cache.size > this.policy.maxEntries) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

// ==================== 工具指标收集器 ====================

class ToolMetricsCollector {
  private metrics: Map<string, ToolMetrics> = new Map()
  private globalMetrics: ToolMetrics = this.createEmptyMetrics()

  private createEmptyMetrics(): ToolMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      retries: 0,
      cacheHits: 0,
      cacheMisses: 0,
    }
  }

  recordCall(
    toolName: string,
    success: boolean,
    durationMs: number,
    retried: boolean,
    cached: boolean
  ): void {
    const getOrCreate = (name: string) => {
      let m = this.metrics.get(name)
      if (!m) {
        m = this.createEmptyMetrics()
        this.metrics.set(name, m)
      }
      return m
    }

    const toolMetrics = getOrCreate(toolName)

    const update = (m: ToolMetrics) => {
      m.totalCalls++
      if (success) m.successfulCalls++
      else m.failedCalls++
      m.totalDurationMs += durationMs
      m.avgDurationMs = m.totalDurationMs / m.totalCalls
      if (retried) m.retries++
      if (cached) m.cacheHits++
      else if (!cached && !retried) m.cacheMisses++
    }

    update(toolMetrics)
    update(this.globalMetrics)
  }

  getToolMetrics(toolName: string): ToolMetrics | undefined {
    return this.metrics.get(toolName)
  }

  getGlobalMetrics(): ToolMetrics {
    return { ...this.globalMetrics }
  }

  getAllMetrics(): Map<string, ToolMetrics> {
    return new Map(this.metrics)
  }

  reset(): void {
    this.metrics.clear()
    this.globalMetrics = this.createEmptyMetrics()
  }
}

// ==================== 审计日志 ====================

class AuditLogger {
  private logs: AuditLogEntry[] = []
  private maxLogs: number = 10000

  add(entry: AuditLogEntry): void {
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  getLogs(limit?: number): AuditLogEntry[] {
    const logs = [...this.logs].reverse()
    return limit ? logs.slice(0, limit) : logs
  }

  getLogsByTool(toolName: string, limit?: number): AuditLogEntry[] {
    const logs = this.logs.filter(log => log.toolName === toolName).reverse()
    return limit ? logs.slice(0, limit) : logs
  }

  getLogsBySession(sessionId: string, limit?: number): AuditLogEntry[] {
    const logs = this.logs.filter(log => log.sessionId === sessionId).reverse()
    return limit ? logs.slice(0, limit) : logs
  }

  clear(): void {
    this.logs = []
  }
}

// ==================== 工具执行器 ====================

export class ToolExecutor {
  private tools: Tool[]
  private config: OpenAIConfig
  private executorConfig: ToolExecutorConfig
  private retryPolicy: RetryPolicy
  private cache: ToolCache
  private metrics: ToolMetricsCollector
  private auditLogger: AuditLogger
  private activeExecutions: number = 0
  private executionQueue: Array<() => Promise<void>> = []

  constructor(config: OpenAIConfig, executorConfig?: ToolExecutorConfig) {
    this.config = config
    this.executorConfig = { ...DEFAULT_CONFIG, ...executorConfig }
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...this.executorConfig.retryPolicy }
    this.tools = [...getAllTools()]
    this.cache = new ToolCache({ ...DEFAULT_CACHE_POLICY, ...this.executorConfig.cachePolicy })
    this.metrics = new ToolMetricsCollector()
    this.auditLogger = new AuditLogger()
  }

  getAvailableTools(): Tool[] {
    return this.tools.filter(tool => tool.isEnabled())
  }

  getTool(name: string): Tool | undefined {
    return findToolByName(this.tools, name)
  }

  getMetrics(): { global: ToolMetrics; byTool: Map<string, ToolMetrics> } {
    return {
      global: this.metrics.getGlobalMetrics(),
      byTool: this.metrics.getAllMetrics(),
    }
  }

  getAuditLogs(limit?: number): AuditLogEntry[] {
    return this.auditLogger.getLogs(limit)
  }

  clearCache(): void {
    this.cache.clear()
  }

  clearMetrics(): void {
    this.metrics.reset()
  }

  clearAuditLogs(): void {
    this.auditLogger.clear()
  }

  private isRetryableError(error: string): boolean {
    const lowerError = error.toLowerCase()
    return this.retryPolicy.retryableErrors.has(error) ||
      Array.from(this.retryPolicy.retryableErrors).some(err =>
        lowerError.includes(err.toLowerCase())
      )
  }

  private calculateBackoffDelay(retryCount: number): number {
    const delay = this.retryPolicy.initialDelayMs *
      Math.pow(this.retryPolicy.backoffMultiplier, retryCount)
    return Math.min(delay, this.retryPolicy.maxDelayMs)
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private generateId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  private zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [],
    }

    const processSchema = (zodSchema: z.ZodType, path: string[] = []): any => {
      const def = zodSchema._def as any
      const typeName = def.typeName

      switch (typeName) {
        case 'ZodObject': {
          const shape = def.shape()
          const properties: Record<string, unknown> = {}
          const required: string[] = []

          for (const [key, value] of Object.entries(shape)) {
            const valueDef = value as z.ZodType
            properties[key] = processSchema(valueDef, [...path, key])
            const valueDefAny = valueDef._def as any
            if (!(valueDefAny.innerType?.optional || valueDefAny.typeName === 'ZodOptional')) {
              required.push(key)
            }
          }

          return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
          }
        }

        case 'ZodString':
          return { type: 'string' }

        case 'ZodNumber':
          return { type: 'number' }

        case 'ZodBoolean':
          return { type: 'boolean' }

        case 'ZodArray': {
          return {
            type: 'array',
            items: processSchema(def.type, path),
          }
        }

        case 'ZodEnum': {
          return {
            type: 'string',
            enum: def.values,
          }
        }

        case 'ZodOptional': {
          return processSchema(def.innerType, path)
        }

        case 'ZodDefault': {
          const innerSchema = processSchema(def.innerType, path)
          return {
            ...innerSchema,
            default: def.defaultValue(),
          }
        }

        default:
          return { type: 'string' }
      }
    }

    return processSchema(schema)
  }

  getToolSchemas(): Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }> {
    return this.getAvailableTools().map(tool => {
      let parameters: Record<string, unknown>

      if (tool.inputJSONSchema) {
        parameters = tool.inputJSONSchema
      } else {
        try {
          parameters = this.zodToJsonSchema(tool.inputSchema)
        } catch {
          parameters = {
            type: 'object',
            properties: {},
          }
        }
      }

      return {
        name: tool.name,
        description: tool.searchHint || tool.name,
        parameters,
      }
    })
  }

  async executeToolCall(
    toolCall: ToolCall,
    context: {
      sessionId?: string
      abortController: AbortController
      onProgress?: (progress: ToolExecutionProgress) => void
    }
  ): Promise<ToolCallResult> {
    const { id, name, arguments: args } = toolCall
    const startTime = Date.now()
    let retryCount = 0
    let lastError: string | undefined

    context.onProgress?.({
      stage: 'tool_start',
      toolId: id,
      toolName: name,
      message: `Starting ${name}`,
    })

    const cachedResult = this.cache.get(name, args)
    if (cachedResult !== undefined) {
      const duration = Date.now() - startTime
      this.metrics.recordCall(name, true, duration, false, true)

      if (this.executorConfig.enableAudit) {
        this.auditLogger.add({
          id: this.generateId(),
          timestamp: Date.now(),
          toolName: name,
          toolCallId: id,
          sessionId: context.sessionId,
          input: args,
          output: cachedResult,
          durationMs: duration,
          status: 'cached',
          retryCount: 0,
        })
      }

      context.onProgress?.({
        stage: 'tool_complete',
        toolId: id,
        toolName: name,
        message: `Completed ${name} (cached)`,
        data: { duration, cached: true },
      })

      return {
        id,
        name,
        result: cachedResult,
        duration,
      }
    }

    this.metrics.recordCall(name, false, 0, false, false)

    const toolContext: ToolUseContext = {
      abortController: context.abortController,
      sessionId: context.sessionId,
      config: this.config,
      onProgress: context.onProgress ? (event) => {
        context.onProgress!({
          stage: 'tool_progress',
          toolId: id,
          toolName: name,
          message: event.message || `${name} in progress`,
          data: event.data,
        })
      } : undefined,
    }

    while (retryCount <= this.retryPolicy.maxRetries) {
      try {
        const tool = this.getTool(name)
        if (!tool) {
          throw new Error(`Tool not found: ${name}`)
        }

        if (tool.validateInput) {
          const validation = await tool.validateInput(args, toolContext)
          if (!validation.result) {
            throw new Error(validation.message)
          }
        }

        const permission = await tool.checkPermissions(args, toolContext)
        if (permission.behavior === 'deny') {
          throw new Error(permission.message)
        }

        if (permission.behavior === 'ask') {
          console.warn(`Permission required for ${name}: ${permission.message}`)
        }

        const timeoutMs = this.executorConfig.defaultTimeoutMs || 60000
        const timeoutId = setTimeout(() => {
          context.abortController.abort()
        }, timeoutMs)

        try {
          const result = await tool.call(
            args,
            toolContext,
            context.onProgress ? (progress) => {
              context.onProgress!({
                stage: 'tool_progress',
                toolId: id,
                toolName: name,
                message: `${name} progress`,
                data: progress.data,
              })
            } : undefined
          )

          clearTimeout(timeoutId)

          const duration = Date.now() - startTime

          if (!result.error) {
            if (tool.isReadOnly?.(args)) {
              this.cache.set(name, args, result.data)
            }
          }

          this.metrics.recordCall(name, !result.error, duration, retryCount > 0, false)

          if (this.executorConfig.enableAudit) {
            this.auditLogger.add({
              id: this.generateId(),
              timestamp: Date.now(),
              toolName: name,
              toolCallId: id,
              sessionId: context.sessionId,
              input: args,
              output: result.data,
              error: result.error,
              durationMs: duration,
              status: result.error ? 'error' : 'success',
              retryCount,
            })
          }

          context.onProgress?.({
            stage: 'tool_complete',
            toolId: id,
            toolName: name,
            message: `Completed ${name}${retryCount > 0 ? ` (${retryCount} retries)` : ''}`,
            data: { duration, retries: retryCount },
          })

          return {
            id,
            name,
            result: result.data,
            error: result.error,
            duration,
          }
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)

        if (retryCount < this.retryPolicy.maxRetries && this.isRetryableError(lastError)) {
          retryCount++
          const delay = this.calculateBackoffDelay(retryCount)

          context.onProgress?.({
            stage: 'tool_progress',
            toolId: id,
            toolName: name,
            message: `Retrying ${name} (attempt ${retryCount}/${this.retryPolicy.maxRetries}) in ${delay}ms`,
            data: { retryCount, delay },
          })

          await this.sleep(delay)
          continue
        }

        break
      }
    }

    const duration = Date.now() - startTime

    if (this.executorConfig.enableAudit) {
      this.auditLogger.add({
        id: this.generateId(),
        timestamp: Date.now(),
        toolName: name,
        toolCallId: id,
        sessionId: context.sessionId,
        input: args,
        error: lastError,
        durationMs: duration,
        status: 'error',
        retryCount,
      })
    }

    context.onProgress?.({
      stage: 'tool_error',
      toolId: id,
      toolName: name,
      message: `Error in ${name}: ${lastError}`,
    })

    return {
      id,
      name,
      result: null,
      error: lastError,
      duration,
    }
  }

  async executeToolCalls(
    toolCalls: ToolCall[],
    context: {
      sessionId?: string
      abortController: AbortController
      onProgress?: (progress: ToolExecutionProgress) => void
    }
  ): Promise<ToolCallResult[]> {
    const maxConcurrent = this.executorConfig.maxConcurrentTools || 5
    const results: ToolCallResult[] = []
    const executing = new Set<Promise<void>>()
    const queue = [...toolCalls]

    while (queue.length > 0 || executing.size > 0) {
      while (executing.size < maxConcurrent && queue.length > 0) {
        const toolCall = queue.shift()!
        const promise = (async () => {
          const result = await this.executeToolCall(toolCall, context)
          results.push(result)
        })()
        executing.add(promise)
        promise.finally(() => executing.delete(promise))
      }

      if (executing.size > 0) {
        await Promise.race(executing)
      }
    }

    return results.sort((a, b) => {
      const aIndex = toolCalls.findIndex(tc => tc.id === a.id)
      const bIndex = toolCalls.findIndex(tc => tc.id === b.id)
      return aIndex - bIndex
    })
  }

  parseToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = []
    const toolCallRegex = /```tool:(\w+)\n([\s\S]*?)\n```/g
    let match

    while ((match = toolCallRegex.exec(content)) !== null) {
      const [, toolName, argsJson] = match
      try {
        const args = JSON.parse(argsJson)
        toolCalls.push({
          id: this.generateId(),
          name: toolName,
          arguments: args,
        })
      } catch (error) {
        console.warn(`Failed to parse tool call arguments for ${toolName}:`, error)
      }
    }

    return toolCalls
  }

  formatToolResults(results: ToolCallResult[]): string {
    if (results.length === 0) {
      return ''
    }

    const sections = results.map(result => {
      const header = `## Tool: ${result.name} (${result.duration}ms)`

      if (result.error) {
        return `${header}\n**Error:** ${result.error}`
      }

      const resultStr = typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result, null, 2)

      return `${header}\n**Result:**\n${resultStr}`
    })

    return `# Tool Execution Results\n\n${sections.join('\n\n')}`
  }
}
