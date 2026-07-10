import { createHash } from 'node:crypto';
import { redactFreeText } from '../../utils/redaction.js';
import { getDb } from './db.js';

export interface AuditEventInput {
  eventType: string;
  loopId?: number;
  model?: string;
  payload?: Record<string, unknown>;
}

export interface AuditEventRecord {
  id: number;
  eventType: string;
  loopId: number | null;
  model: string | null;
  payload: Record<string, unknown>;
  previousSignature: string | null;
  signature: string;
  createdAt: string;
}

export function appendAuditEvent(input: AuditEventInput): AuditEventRecord {
  const db = getDb();
  if (!/^[a-z][a-z0-9_.:-]{1,100}$/i.test(input.eventType)) throw new Error('Invalid audit event type.');
  const previous = db.prepare('SELECT signature FROM audit_log ORDER BY id DESC LIMIT 1').get() as { signature: string | null } | undefined;
  const payload = redactValue(input.payload ?? {}) as Record<string, unknown>;
  const canonical = canonicalJson({ eventType: input.eventType, loopId: input.loopId ?? null, model: input.model ?? null, payload });
  const previousSignature = previous?.signature ?? null;
  const signature = sign(previousSignature, canonical);
  const result = db.prepare(`
    INSERT INTO audit_log (event_type, model, loop_id, feature_summary, payload, previous_signature, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.eventType, input.model ?? null, input.loopId ?? null, canonical, JSON.stringify(payload), previousSignature, signature);
  return getAuditEvent(Number(result.lastInsertRowid))!;
}

export function getAuditEvent(id: number): AuditEventRecord | null {
  const row = getDb().prepare(`
    SELECT id, event_type, loop_id, model, payload, previous_signature, signature, created_at
    FROM audit_log WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function queryAuditEvents(options: { loopId?: number; eventType?: string; limit?: number } = {}): AuditEventRecord[] {
  const clauses: string[] = []; const params: unknown[] = [];
  if (options.loopId !== undefined) { clauses.push('loop_id = ?'); params.push(options.loopId); }
  if (options.eventType !== undefined) { clauses.push('event_type = ?'); params.push(options.eventType); }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Audit limit must be between 1 and 1000.');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return (getDb().prepare(`SELECT id, event_type, loop_id, model, payload, previous_signature, signature, created_at FROM audit_log ${where} ORDER BY id ASC LIMIT ?`).all(...params, limit) as Record<string, unknown>[]).map(mapRow);
}

export function verifyAuditChain(): { valid: boolean; invalidId?: number } {
  const db = getDb();
  const rows = db.prepare('SELECT id, event_type, loop_id, model, payload, previous_signature, signature FROM audit_log ORDER BY id ASC').all() as Record<string, unknown>[];
  let previous: string | null = null;
  for (const row of rows) {
    const payload = JSON.parse(String(row.payload ?? '{}')) as Record<string, unknown>;
    const canonical = canonicalJson({ eventType: row.event_type, loopId: row.loop_id ?? null, model: row.model ?? null, payload });
    if (row.previous_signature !== previous || row.signature !== sign(previous, canonical)) return { valid: false, invalidId: Number(row.id) };
    previous = String(row.signature);
  }
  return { valid: true };
}

export function withAuditedTransaction<T>(event: AuditEventInput, mutation: () => T): T {
  return getDb().transaction(() => { const value = mutation(); appendAuditEvent(event); return value; })();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function sign(previous: string | null, canonical: string): string { return createHash('sha256').update(`${previous ?? 'GENESIS'}\n${canonical}`).digest('hex'); }
function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactFreeText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, /token|secret|password|api[_-]?key/i.test(key) ? '[REDACTED]' : redactValue(entry)]));
  return value;
}
function mapRow(row: Record<string, unknown>): AuditEventRecord { return { id: Number(row.id), eventType: String(row.event_type), loopId: row.loop_id === null ? null : Number(row.loop_id), model: row.model === null ? null : String(row.model), payload: JSON.parse(String(row.payload ?? '{}')) as Record<string, unknown>, previousSignature: row.previous_signature === null ? null : String(row.previous_signature), signature: String(row.signature), createdAt: String(row.created_at) }; }
