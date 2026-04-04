import { logger } from "./logger.js";

export interface ValidationRule {
  required?: boolean;
  type?: "string" | "number" | "boolean" | "array" | "object";
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  validator?: (value: unknown) => boolean;
  message?: string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export class Validator {
  private errors: ValidationError[] = [];

  validate(data: Record<string, unknown>, schema: ValidationSchema): { valid: boolean; errors: ValidationError[] } {
    this.errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      this.validateField(field, value, rules);
    }

    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
    };
  }

  private validateField(field: string, value: unknown, rules: ValidationRule): void {
    // Required check
    if (rules.required) {
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        this.addError(field, rules.message || `${field} is required`, value);
        return;
      }
    } else if (value === undefined || value === null) {
      return;
    }

    // Type check
    if (rules.type) {
      const typeValid = this.checkType(value, rules.type);
      if (!typeValid) {
        this.addError(field, rules.message || `${field} must be of type ${rules.type}`, value);
        return;
      }
    }

    // String validation
    if (rules.type === "string" && typeof value === "string") {
      if (rules.min !== undefined && value.length < rules.min) {
        this.addError(field, rules.message || `${field} must be at least ${rules.min} characters`, value);
      }
      if (rules.max !== undefined && value.length > rules.max) {
        this.addError(field, rules.message || `${field} must be at most ${rules.max} characters`, value);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        this.addError(field, rules.message || `${field} format is invalid`, value);
      }
    }

    // Number validation
    if (rules.type === "number" && typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) {
        this.addError(field, rules.message || `${field} must be at least ${rules.min}`, value);
      }
      if (rules.max !== undefined && value > rules.max) {
        this.addError(field, rules.message || `${field} must be at most ${rules.max}`, value);
      }
    }

    // Array validation
    if (rules.type === "array" && Array.isArray(value)) {
      if (rules.min !== undefined && value.length < rules.min) {
        this.addError(field, rules.message || `${field} must have at least ${rules.min} items`, value);
      }
      if (rules.max !== undefined && value.length > rules.max) {
        this.addError(field, rules.message || `${field} must have at most ${rules.max} items`, value);
      }
    }

    // Enum validation
    if (rules.enum && typeof value === "string") {
      if (!rules.enum.includes(value)) {
        this.addError(field, rules.message || `${field} must be one of: ${rules.enum.join(", ")}`, value);
      }
    }

    // Custom validator
    if (rules.validator) {
      try {
        if (!rules.validator(value)) {
          this.addError(field, rules.message || `${field} validation failed`, value);
        }
      } catch (error) {
        logger.warn("Custom validator error", { field, error });
        this.addError(field, rules.message || `${field} validation failed`, value);
      }
    }
  }

  private checkType(value: unknown, type: string): boolean {
    switch (type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value);
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private addError(field: string, message: string, value?: unknown): void {
    this.errors.push({ field, message, value });
  }
}

// Sanitization utilities
export function sanitizeString(input: unknown, maxLength?: number): string {
  if (typeof input !== "string") {
    return "";
  }
  let sanitized = input.trim();
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
}

export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeNumber(input: unknown, min?: number, max?: number): number | null {
  const num = Number(input);
  if (isNaN(num)) {
    return null;
  }
  let result = num;
  if (min !== undefined && result < min) {
    result = min;
  }
  if (max !== undefined && result > max) {
    result = max;
  }
  return result;
}

export function sanitizeBoolean(input: unknown): boolean {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input === "string") {
    const lower = input.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }
  if (typeof input === "number") {
    return input === 1;
  }
  return false;
}

const defaultValidator = new Validator();

export { defaultValidator as validator };
