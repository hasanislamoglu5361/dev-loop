// packages/core/src/db/queries/sql-values.ts
// Shared SQL value helpers for dev-loop query modules
// These helpers centralize normalization to prevent truthiness bugs in persistence code.

/** Normalize a value for SQL parameter binding.
 *  Booleans become 0/1; everything else passes through unchanged.
 *  Used where existing queries relied on `typeof x === 'boolean' ? Number(x) : x`. */
export function normalizeSqlValue(value: unknown): unknown {
  return typeof value === 'boolean' ? Number(value) : value;
}

/** Return undefined as null, otherwise pass through.
 *  Prefer this over `value || null` to preserve falsy values like 0 and false. */
export function sqlNullable<T extends string | number | Buffer>(value: T | null | undefined): T | null {
  return value ?? null;
}

/** Return undefined/null as null, otherwise pass through.
 *  Accepts unknown for database result objects where all fields are typed loosely. */
export function toSqlSafe(value: unknown): number | string | Buffer | null {
  if (value === undefined || value === null) return null;
  return value as number | string | Buffer;
}

/** Explicitly convert a boolean to SQL integer (0/1), or null if undefined. */
export function sqlBoolean(value: boolean | undefined): number | null {
  return value === undefined ? null : Number(value);
}

/** Convert any value to JSON string for storage, or null if undefined/null. */
export function sqlJsonString(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}