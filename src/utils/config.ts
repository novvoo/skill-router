import { logger } from "./logger.js";

interface EnvValidationRule {
  required?: boolean;
  type?: "string" | "number" | "boolean";
  default?: string | number | boolean;
  validator?: (value: string) => boolean;
  description?: string;
}

const ENV_RULES: Record<string, EnvValidationRule> = {
  PORT: {
    type: "number",
    default: 8080,
    description: "HTTP server port",
  },
  HOST: {
    type: "string",
    default: "127.0.0.1",
    description: "HTTP server host",
  },
  OPENAI_API_KEY: {
    required: false,
    type: "string",
    description: "OpenAI API key",
  },
  OPENAI_BASE_URL: {
    required: false,
    type: "string",
    description: "OpenAI API base URL",
  },
  OPENAI_MODEL: {
    required: false,
    type: "string",
    description: "OpenAI model name",
  },
  EMBEDDING_MODEL: {
    type: "string",
    default: "fast",
    description: "Embedding model or preset",
  },
  LOG_LEVEL: {
    type: "string",
    default: "info",
    validator: (v) => ["debug", "info", "warn", "error"].includes(v.toLowerCase()),
    description: "Log level (debug, info, warn, error)",
  },
  RATE_LIMIT_ENABLED: {
    type: "boolean",
    default: true,
    description: "Enable rate limiting",
  },
  RATE_LIMIT_WINDOW_MS: {
    type: "number",
    default: 60000,
    description: "Rate limit window in milliseconds",
  },
  RATE_LIMIT_MAX_REQUESTS: {
    type: "number",
    default: 100,
    description: "Max requests per window",
  },
  CORS_ORIGIN: {
    type: "string",
    default: "*",
    description: "CORS allowed origin",
  },
  MAX_REQUEST_SIZE_BYTES: {
    type: "number",
    default: 50 * 1024 * 1024,
    description: "Max request size in bytes (default 50MB)",
  },
  HF_ENDPOINT: {
    type: "string",
    validator: (v) => !v || v === "https://huggingface.co" || v === "https://hf-mirror.com",
    description: "Hugging Face endpoint",
  },
};

export interface AppConfig {
  port: number;
  host: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  embeddingModel: string;
  logLevel: string;
  rateLimitEnabled: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  corsOrigin: string;
  maxRequestSizeBytes: number;
  hfEndpoint?: string;
}

class ConfigManager {
  private config: AppConfig;
  private isValid: boolean = true;
  private validationErrors: string[] = [];

  constructor() {
    this.config = this.loadAndValidate();
  }

  private loadAndValidate(): AppConfig {
    const errors: string[] = [];
    const config: Partial<AppConfig> = {};

    for (const [key, rule] of Object.entries(ENV_RULES)) {
      const value = process.env[key];
      
      if (rule.required && !value) {
        errors.push(`Missing required environment variable: ${key} (${rule.description})`);
        continue;
      }

      if (!value && rule.default !== undefined) {
        (config as any)[this.camelCase(key)] = rule.default;
        continue;
      }

      if (value) {
        try {
          let parsedValue: any = value;
          
          if (rule.type === "number") {
            parsedValue = Number(value);
            if (isNaN(parsedValue)) {
              throw new Error(`Must be a number`);
            }
          } else if (rule.type === "boolean") {
            parsedValue = value.toLowerCase() === "true" || value === "1";
          }

          if (rule.validator && !rule.validator(value)) {
            throw new Error(`Validation failed`);
          }

          (config as any)[this.camelCase(key)] = parsedValue;
        } catch (error) {
          errors.push(`Invalid ${key}: ${error instanceof Error ? error.message : "Invalid value"} (${rule.description})`);
        }
      }
    }

    this.validationErrors = errors;
    this.isValid = errors.length === 0;

    if (!this.isValid) {
      logger.error("Environment variable validation failed", undefined, { errors });
    } else {
      logger.info("Environment variables loaded successfully");
    }

    return config as AppConfig;
  }

  private camelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  getValidationErrors(): string[] {
    return [...this.validationErrors];
  }

  isValidConfig(): boolean {
    return this.isValid;
  }

  get(key: keyof AppConfig): AppConfig[keyof AppConfig] {
    return this.config[key];
  }
}

const configManager = new ConfigManager();

export { ConfigManager, configManager as config };
