// Core error classes for actionable failures across dev-loop
// All errors extend DevLoopError which extends native Error

export interface SerializedDevLoopError {
  message: string;
  code?: string;
  action?: string;
  details?: Record<string, unknown>;
}

/** Key names that must never appear unredacted in a serialized error. */
const SECRET_KEY_PATTERN = /api[-_]?key|token|password|secret|authorization/i;

/** Recursively redact secret-like keys from a details value before serialization. */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(nested);
    }
    return result;
  }

  return value;
}

function redactDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return details ? (redactValue(details) as Record<string, unknown>) : details;
}

/**
 * Base error class for all DevLoop errors.
 * Extends native Error to preserve stack traces and instanceof checks.
 */
export class DevLoopError extends Error {
  readonly code: string;
  readonly action?: string;
  readonly details?: Record<string, unknown>;
  override cause?: Error;

  constructor(
    message: string,
    code: string = 'devloop.error',
    action?: string,
    details?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);
    this.name = 'DevLoopError';
    this.code = code;
    this.action = action;
    this.details = details ?? undefined;
    this.cause = cause;

    // Restore prototype chain for proper instanceof checks with subclasses.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialize to a safe JSON object without leaking stack traces or cause chains.
   */
  toJSON(): SerializedDevLoopError {
    const json: SerializedDevLoopError = { message: this.message };
    if (this.code) json.code = this.code;
    if (this.action !== undefined) json.action = this.action;
    if (this.details && Object.keys(this.details).length > 0) json.details = redactDetails(this.details);
    return json;
  }

  override toString(): string {
    const parts = [this.name, ':', this.message];
    if (this.code) parts.push(` (${this.code})`);
    if (this.action) parts.push(` [action: ${this.action}]`);
    return parts.join('');
  }
}

/**
 * Thrown when configuration loading or validation fails.
 */
export class ConfigError extends DevLoopError {
  constructor(message: string, action?: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'config.error', action, details, cause);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when database operations fail.
 */
export class DatabaseError extends DevLoopError {
  constructor(message: string, action?: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'database.error', action, details, cause);
    this.name = 'DatabaseError';
  }
}

/**
 * Thrown when model API calls fail (timeout, auth, rate limit).
 */
export class ModelError extends DevLoopError {
  constructor(message: string, action?: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'model.error', action, details, cause);
    this.name = 'ModelError';
  }
}

/**
 * Thrown when verification (tests/lint/typecheck) fails.
 */
export class VerifierError extends DevLoopError {
  constructor(message: string, action?: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'verifier.error', action, details, cause);
    this.name = 'VerifierError';
  }
}

/**
 * Thrown when planning operations fail or exceed limits.
 */
export class PlanningError extends DevLoopError {
  constructor(message: string, action?: string, details?: Record<string, unknown>, cause?: Error) {
    super(message, 'planning.error', action, details, cause);
    this.name = 'PlanningError';
  }
}

/**
 * Thrown when a database migration is aborted by the user or safety checks.
 */
export class MigrationAbortedError extends DevLoopError {
  constructor() {
    super('Migration was aborted before any changes were applied.', 'migration.aborted');
    this.name = 'MigrationAbortedError';
  }
}

// Re-export DatabaseConnectionError from connection.ts as it's used in tests
export class DatabaseConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}
