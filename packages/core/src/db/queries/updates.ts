// packages/core/src/db/queries/updates.ts
// Shared dynamic UPDATE query helpers for dev-loop query modules
// Rule: Any dynamic SQL identifier must come from an explicit map. Never interpolate arbitrary object keys into SQL.

/** A const-map that binds typed API keys to their database column names. */
export interface UpdateColumnMap {
  [apiKey: string]: string;
}

/** Build a parameterized SET clause for UPDATE queries from typed partial updates.
 *
 * @param updates - Partial record of field updates keyed by the public API key
 * @param columns - Const map binding each public API key to its database column name
 * @returns An object with the SQL `SET` fragment and bound values, or null if no fields were provided
 */
export function buildUpdate<T extends string>(
  updates: Partial<Record<T, unknown>>,
  columns: Record<T, string>,
  options: { errorLabel?: string; serialize?: (key: T, value: unknown) => unknown } = {},
): { setSql: string; values: unknown[] } | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [rawKey, value] of Object.entries(updates) as Array<[T, unknown]>) {
    if (value === undefined) continue;

    const column = columns[rawKey];
    if (!column) {
      const label = options.errorLabel ?? 'update';
      throw new Error(`Unsupported ${label} field: ${rawKey}`);
    }

    fields.push(`${column} = ?`);
    values.push(options.serialize ? options.serialize(rawKey, value) : value);
  }

  return fields.length === 0 ? null : { setSql: fields.join(', '), values };
}
