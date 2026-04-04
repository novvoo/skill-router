import { z } from 'zod';
import { logger } from './logger.js';

const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url('Invalid base URL'),
  model: z.string().min(1, 'Model is required'),
  embeddingModel: z.string().optional(),
  hfEndpoint: z.string().url().optional(),
  defaultHeaders: z.record(z.string()).optional(),
  systemContent: z.string().optional(),
});

const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  corsOrigin: z.string().optional(),
});

const SecurityConfigSchema = z.object({
  enableRateLimiting: z.boolean().default(true),
  rateLimitWindowMs: z.number().int().min(1000).default(60000),
  rateLimitMaxRequests: z.number().int().min(1).default(100),
  enablePathValidation: z.boolean().default(true),
  allowedPaths: z.array(z.string()).default([process.cwd()]),
});

const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  enableStructuredLogging: z.boolean().default(true),
  logToFile: z.boolean().default(false),
  logFilePath: z.string().optional(),
});

const AgentConfigSchema = z.object({
  defaultMaxToolCalls: z.number().int().min(1).default(50),
  defaultMaxExecutionTimeMs: z.number().int().min(1000).default(1800000),
  defaultMaxConcurrentTools: z.number().int().min(1).default(3),
});

const AppConfigSchema = z.object({
  openai: OpenAIConfigSchema.partial().optional(),
  server: ServerConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  agents: AgentConfigSchema.default({}),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface ConfigValidationResult {
  valid: boolean;
  config?: AppConfig;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  private config: Partial<AppConfig>;
  private warnings: string[] = [];
  private errors: string[] = [];

  constructor(config: Partial<AppConfig> = {}) {
    this.config = config;
  }

  validate(): ConfigValidationResult {
    this.errors = [];
    this.warnings = [];

    try {
      const validatedConfig = AppConfigSchema.parse(this.config);
      
      this.performAdditionalChecks(validatedConfig);

      return {
        valid: this.errors.length === 0,
        config: validatedConfig,
        errors: this.errors,
        warnings: this.warnings,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.errors = error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
      } else {
        this.errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      }

      return {
        valid: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  private performAdditionalChecks(config: AppConfig): void {
    if (config.openai) {
      this.validateOpenAIConfig(config.openai);
    }

    this.validateSecurityConfig(config.security);
    this.validateAgentConfig(config.agents);
  }

  private validateOpenAIConfig(config: Partial<OpenAIConfig>): void {
    if (config.apiKey) {
      if (config.apiKey.startsWith('sk-') && config.apiKey.length < 20) {
        this.warnings.push('API key appears to be too short');
      }
    } else {
      this.warnings.push('OpenAI API key is not configured - some features may not work');
    }

    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        this.errors.push('OpenAI base URL is invalid');
      }
    }
  }

  private validateSecurityConfig(config: SecurityConfig): void {
    if (!config.enableRateLimiting) {
      this.warnings.push('Rate limiting is disabled - this may expose the service to abuse');
    }

    if (!config.enablePathValidation) {
      this.warnings.push('Path validation is disabled - this may be a security risk');
    }

    if (config.allowedPaths.length === 0) {
      this.errors.push('No allowed paths configured');
    }
  }

  private validateAgentConfig(config: AgentConfig): void {
    if (config.defaultMaxToolCalls > 1000) {
      this.warnings.push('Max tool calls is very high - this may lead to long-running operations');
    }

    if (config.defaultMaxExecutionTimeMs > 3600000) {
      this.warnings.push('Max execution time is very long (over 1 hour)');
    }

    if (config.defaultMaxConcurrentTools > 10) {
      this.warnings.push('High number of concurrent tools - this may impact performance');
    }
  }

  static fromEnv(): ConfigValidator {
    const config: Partial<AppConfig> = {};
    
    if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL) {
      config.openai = {} as any;
      if (process.env.OPENAI_API_KEY) (config.openai as any).apiKey = process.env.OPENAI_API_KEY;
      if (process.env.OPENAI_BASE_URL) (config.openai as any).baseUrl = process.env.OPENAI_BASE_URL;
      if (process.env.OPENAI_MODEL) (config.openai as any).model = process.env.OPENAI_MODEL;
      if (process.env.OPENAI_EMBEDDING_MODEL) (config.openai as any).embeddingModel = process.env.OPENAI_EMBEDDING_MODEL;
    }
    
    if (process.env.PORT || process.env.HOST || process.env.CORS_ORIGIN) {
      config.server = {} as any;
      if (process.env.PORT) (config.server as any).port = parseInt(process.env.PORT, 10);
      if (process.env.HOST) (config.server as any).host = process.env.HOST;
      if (process.env.CORS_ORIGIN) (config.server as any).corsOrigin = process.env.CORS_ORIGIN;
    }
    
    if (process.env.ENABLE_RATE_LIMITING || process.env.RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_MAX_REQUESTS) {
      config.security = {} as any;
      if (process.env.ENABLE_RATE_LIMITING) (config.security as any).enableRateLimiting = process.env.ENABLE_RATE_LIMITING === 'true';
      if (process.env.RATE_LIMIT_WINDOW_MS) (config.security as any).rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10);
      if (process.env.RATE_LIMIT_MAX_REQUESTS) (config.security as any).rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10);
    }
    
    if (process.env.LOG_LEVEL || process.env.ENABLE_STRUCTURED_LOGGING) {
      config.logging = {} as any;
      if (process.env.LOG_LEVEL) (config.logging as any).level = process.env.LOG_LEVEL as any;
      if (process.env.ENABLE_STRUCTURED_LOGGING) (config.logging as any).enableStructuredLogging = process.env.ENABLE_STRUCTURED_LOGGING === 'true';
    }
    
    if (process.env.AGENT_MAX_TOOL_CALLS || process.env.AGENT_MAX_EXECUTION_TIME_MS || process.env.AGENT_MAX_CONCURRENT_TOOLS) {
      config.agents = {} as any;
      if (process.env.AGENT_MAX_TOOL_CALLS) (config.agents as any).defaultMaxToolCalls = parseInt(process.env.AGENT_MAX_TOOL_CALLS, 10);
      if (process.env.AGENT_MAX_EXECUTION_TIME_MS) (config.agents as any).defaultMaxExecutionTimeMs = parseInt(process.env.AGENT_MAX_EXECUTION_TIME_MS, 10);
      if (process.env.AGENT_MAX_CONCURRENT_TOOLS) (config.agents as any).defaultMaxConcurrentTools = parseInt(process.env.AGENT_MAX_CONCURRENT_TOOLS, 10);
    }

    return new ConfigValidator(config);
  }

  logValidationResult(result: ConfigValidationResult): void {
    if (result.warnings.length > 0) {
      logger.warn('Configuration warnings: ' + JSON.stringify(result.warnings));
    }

    if (result.errors.length > 0) {
      logger.error('Configuration errors: ' + JSON.stringify(result.errors));
    } else if (result.config) {
      logger.info('Configuration validated successfully');
    }
  }
}

export function validateConfig(config: Partial<AppConfig>): ConfigValidationResult {
  const validator = new ConfigValidator(config);
  return validator.validate();
}
