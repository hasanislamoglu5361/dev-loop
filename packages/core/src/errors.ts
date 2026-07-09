// Core error classes for actionable failures across dev-loop
// All errors extend DevLoopError which extends native Error

export interface SerializedDevLoopError {
  message: string;
  code?: string;
  action?: string;
  details?: Record<string, unknown>;
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

    // Restore prototype chain for proper instanceof checks with custom classes
    Object.setPrototypeOf(this, DevLoopError.prototype);
  }

  /**
   * Serialize to a safe JSON object without leaking stack traces or cause chains.
   */
  toJSON(): SerializedDevLoopError {
    const json: SerializedDevLoopError = { message: this.message };
    if (this.code) json.code = this.code;
    if (this.action !== undefined) json.action = this.action;
    if (this.details && Object.keys(this.details).length > 0) json.details = this.details;
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
  constructor(message: string, cause?: Error) {
    super(message, 'database.error');
    this.cause = cause;
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