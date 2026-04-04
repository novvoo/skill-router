import type { z } from 'zod'

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

export type ToolProgressData = {
  type: string
  [key: string]: unknown
}

export type ToolProgress<P extends ToolProgressData> = {
  toolUseID: string
  data: P
}

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: ToolProgress<P>
) => void

export type ToolResult<T> = {
  data: T
  error?: string
}

export type ValidationResult =
  | { result: true }
  | {
      result: false
      message: string
      errorCode: number
    }

export type PermissionResult = 
  | { behavior: 'allow'; updatedInput: any }
  | { behavior: 'deny'; message: string }
  | { behavior: 'ask'; message: string; suggestions?: any[] }

export type ToolUseContext = {
  abortController: AbortController
  sessionId?: string
  config: {
    apiKey: string
    baseUrl: string
    model: string
    embeddingModel?: string
    hfEndpoint?: string
    defaultHeaders?: Record<string, string>
    systemContent?: string
  }
  onProgress?: (event: { stage: string; message: string; data?: any }) => void
}

// Type for any schema that outputs an object with string keys
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  /**
   * Tool name
   */
  readonly name: string
  
  /**
   * Optional aliases for backwards compatibility
   */
  aliases?: string[]
  
  /**
   * One-line capability phrase for search
   */
  searchHint?: string
  
  /**
   * Tool description
   */
  description(input: z.infer<Input>): Promise<string>
  
  /**
   * Input schema
   */
  readonly inputSchema: Input
  
  /**
   * Optional JSON schema for input
   */
  readonly inputJSONSchema?: ToolInputJSONSchema
  
  /**
   * Output schema
   */
  outputSchema?: z.ZodType<unknown>
  
  /**
   * Maximum result size in characters
   */
  maxResultSizeChars: number
  
  /**
   * Whether this tool should be deferred (lazy loaded)
   */
  readonly shouldDefer?: boolean
  
  /**
   * Whether this tool should always be loaded
   */
  readonly alwaysLoad?: boolean
  
  /**
   * Category for tool organization
   */
  readonly category?: 'file' | 'search' | 'system' | 'network' | 'agent' | 'planning' | 'interaction'
  
  /**
   * Tags for better tool discovery
   */
  readonly tags?: string[]
  
  /**
   * Main tool execution function
   */
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    onProgress?: ToolCallProgress<P>
  ): Promise<ToolResult<Output>>
  
  /**
   * Check if tool is enabled
   */
  isEnabled(): boolean
  
  /**
   * Check if tool is safe for concurrent execution
   */
  isConcurrencySafe(input: z.infer<Input>): boolean
  
  /**
   * Check if tool is read-only
   */
  isReadOnly(input: z.infer<Input>): boolean
  
  /**
   * Check if tool is destructive
   */
  isDestructive?(input: z.infer<Input>): boolean
  
  /**
   * Validate input
   */
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext
  ): Promise<ValidationResult>
  
  /**
   * Check permissions
   */
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext
  ): Promise<PermissionResult>
  
  /**
   * Get user-facing name
   */
  userFacingName(input: Partial<z.infer<Input>> | undefined): string
  
  /**
   * Get tool use summary
   */
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  
  /**
   * Get activity description
   */
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined
  ): string | null
}

/**
 * A collection of tools
 */
export type Tools = readonly Tool[]

/**
 * Methods that `buildTool` supplies a default for
 */
type DefaultableToolKeys =
  | 'isEnabled'
  | 'isConcurrencySafe'
  | 'isReadOnly'
  | 'isDestructive'
  | 'checkPermissions'
  | 'userFacingName'
  | 'shouldDefer'
  | 'alwaysLoad'
  | 'category'
  | 'tags'

/**
 * Tool definition accepted by `buildTool`
 */
export type ToolDef<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = Omit<Tool<Input, Output, P>, DefaultableToolKeys> &
  Partial<Pick<Tool<Input, Output, P>, DefaultableToolKeys>>

/**
 * Type-level spread mirroring `{ ...TOOL_DEFAULTS, ...def }`
 */
type BuiltTool<D> = Omit<D, DefaultableToolKeys> & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K]
}

/**
 * Build a complete `Tool` from a partial definition
 */
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (
    input: { [key: string]: unknown },
    _ctx?: ToolUseContext,
  ): Promise<PermissionResult> =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  userFacingName: (_input?: unknown) => '',
  shouldDefer: false,
  alwaysLoad: false,
  category: undefined,
  tags: [],
}

type ToolDefaults = typeof TOOL_DEFAULTS

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any, any, any>

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  return {
    ...TOOL_DEFAULTS,
    ...def,
  } as BuiltTool<D>
}

/**
 * Checks if a tool matches the given name (primary name or alias)
 */
export function toolMatchesName(
  tool: { name: string; aliases?: string[] },
  name: string,
): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

/**
 * Finds a tool by name or alias from a list of tools
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}