export function mergeDefaults<T>(defaults: T, overrides: unknown): T {
  if (!isPlainObject(overrides)) {
    return overrides === undefined || overrides === null ? defaults : overrides as T;
  }

  const result: Record<string, unknown> = isPlainObject(defaults) ? { ...defaults } : {};
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] = isPlainObject(value) && isPlainObject(current)
      ? mergeDefaults(current, value)
      : value;
  }

  return result as T;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}
