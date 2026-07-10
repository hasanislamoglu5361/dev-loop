// packages/core/src/analytics/export.ts
// CSV and JSON export utilities with secret redaction for analytics data.

export interface ExportOptions {
  /** Columns/keys to include in the export (default: all) */
  columns?: string[];
  /** Whether to escape strings containing commas, quotes, or newlines */
  escapeQuotes?: boolean;
}

// Sensitive keys that should be redacted from exports
const SENSITIVE_KEYS = [
  'api_key',
  'secret',
  'token',
  'password',
  'private_key',
  'auth_token',
] as const;

/**
 * Sanitize data rows by removing sensitive keys before export.
 */
export function sanitizeExport(
  data: Record<string, unknown>[],
  customSensitiveKeys?: string[]
): Record<string, unknown>[] {
  const allSensitive = [...SENSITIVE_KEYS, ...(customSensitiveKeys ?? [])];

  return data.map(row => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (allSensitive.some(s => key.toLowerCase().includes(s))) {
        continue; // skip sensitive keys
      }
      sanitized[key] = value;
    }
    return sanitized;
  });
}

/**
 * Export data as CSV string.
 */
export function exportToCsv(
  data: Record<string, unknown>[],
  options: ExportOptions = {}
): string {
  if (data.length === 0) return '';

  const columns = options.columns ?? Object.keys(data[0]);
  const escaped = sanitizeExport(data);

  // Header row
  let csv = columns.map(escapeCsvField).join(',');

  // Data rows
  for (const row of escaped) {
    const line = columns.map(col => escapeCsvField(String(row[col] ?? ''))).join(',');
    csv += '\n' + line;
  }

  return csv;
}

/**
 * Export data as JSON string.
 */
export function exportToJson(
  data: Record<string, unknown>[],
  options: ExportOptions = {}
): string {
  const escaped = sanitizeExport(data);

  if (options.columns) {
    // Filter to only selected columns
    return JSON.stringify(
      escaped.map(row => {
        const filtered: Record<string, unknown> = {};
        for (const col of options.columns!) {
          if (col in row) {
            filtered[col] = row[col];
          }
        }
        return filtered;
      }),
      null,
      2
    );
  }

  return JSON.stringify(escaped, null, 2);
}

/**
 * Escape a single CSV field value.
 */
function escapeCsvField(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}