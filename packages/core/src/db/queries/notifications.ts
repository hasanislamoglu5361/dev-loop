// packages/core/src/db/queries/notifications.ts
// Notification query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable, sqlJsonString } from './sql-values.js';

/** Get notification settings */
export async function getNotificationSettings(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM notification_settings ORDER BY id ASC').all() as Record<string, unknown>[];
}

/** Update notification settings */
export async function updateNotificationSettings(
  id: number,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.channel !== undefined) {
    fields.push('channel = ?');
    values.push(updates.channel);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(Number(updates.enabled));
  }
  if (updates.recipients !== undefined) {
    fields.push('recipients = ?');
    values.push(sqlJsonString(updates.recipients));
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE notification_settings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Create an alert rule */
export async function createAlertRule(data: {
  loopId?: number;
  featureType?: string;
  name?: string;
  alertType: 'error' | 'warning' | 'info';
  condition?: string;
  modelFilter?: string[];
  enabled?: boolean;
}): Promise<{ id: number }> {
  const db = getDb();

  // Validate alert type using allowed list to prevent SQL injection via dynamic fields
  const ALLOWED_ALERT_TYPES = ['error', 'warning', 'info'] as const;
  if (!ALLOWED_ALERT_TYPES.includes(data.alertType)) {
    throw new Error(`Invalid alert type: ${data.alertType}`);
  }

  // Validate condition field names against allowed list to prevent SQL injection via dynamic identifiers
  const ALLOWED_CONDITION_FIELDS = ['model', 'feature_type', 'error_message'] as const;
  if (data.condition) {
    const parsedConditionFields = JSON.parse(data.condition);
    for (const key of Object.keys(parsedConditionFields)) {
      if (!(ALLOWED_CONDITION_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`Invalid condition field: ${key}`);
      }
    }
  }

  const stmt = db.prepare(`
    INSERT INTO alert_rules (loop_id, feature_type, name, alert_type, condition, model_filter, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.loopId ?? null,
    sqlNullable(data.featureType),
    sqlNullable(data.name),
    data.alertType,
    sqlJsonString(data.condition),
    sqlJsonString(data.modelFilter ?? []),
    data.enabled !== undefined ? Number(data.enabled) : 1
  );

  return { id: result.lastInsertRowid as number };
}

/** Get alert rules */
export async function getAlertRules(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

/** Log a notification */
export async function logNotification(params: {
  channel: string;
  eventType: string;
  message?: string;
  loopId?: number;
  sent?: boolean;
  errorMessage?: string;
}): Promise<void> {
  const db = getDb();

  db.prepare(`
    INSERT INTO notification_log (channel, event_type, message, loop_id, sent, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.channel,
    params.eventType,
    sqlNullable(params.message),
    params.loopId ?? null,
    params.sent ? 1 : 0,
    sqlNullable(params.errorMessage)
  );
}

/** Get notification log */
export async function getNotificationLog(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM notification_log ORDER BY created_at DESC').all() as Record<string, unknown>[];
}
