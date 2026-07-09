// packages/core/src/db/queries/tickets.ts
// Ticket query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable } from './sql-values.js';

/** Get tickets */
export async function getTickets(options?: { loopId?: number; status?: string }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM tickets WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  if (options?.status) {
    sql += ` AND status = ?`;
    params.push(options.status);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Save or update a ticket */
export async function saveTicket(params: {
  provider: string;
  ticketId: string;
  title?: string;
  description?: string;
  status?: string;
  linkedFeatureId?: string;
  loopId?: number;
  commentPosted?: boolean;
  injectionDetected?: boolean;
}): Promise<void> {
  const db = getDb();

  const existing = db.prepare(`SELECT id FROM tickets WHERE provider = ? AND ticket_id = ?`).get(
    params.provider,
    params.ticketId
  ) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE tickets SET title = ?, description = ?, status = ?, linked_feature_id = ?, loop_id = ?, comment_posted = ?, injection_detected = ?
      WHERE provider = ? AND ticket_id = ?
    `).run(
      sqlNullable(params.title),
      sqlNullable(params.description),
      sqlNullable(params.status),
      sqlNullable(params.linkedFeatureId),
      params.loopId ?? null,
      params.commentPosted ? 1 : 0,
      params.injectionDetected ? 1 : 0,
      params.provider,
      params.ticketId
    );
    return;
  }

  db.prepare(`
    INSERT INTO tickets (provider, ticket_id, title, description, status, linked_feature_id, loop_id, comment_posted, injection_detected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.provider,
    params.ticketId,
    sqlNullable(params.title),
    sqlNullable(params.description),
    sqlNullable(params.status),
    sqlNullable(params.linkedFeatureId),
    params.loopId ?? null,
    params.commentPosted ? 1 : 0,
    params.injectionDetected ? 1 : 0
  );
}

/** Get ticket by provider and ID */
export async function getTicket(provider: string, ticketId: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  return db.prepare('SELECT * FROM tickets WHERE provider = ? AND ticket_id = ?').get(provider, ticketId) as Record<string, unknown> | null;
}

/** Update a ticket */
export async function updateTicket(id: number, updates: Partial<Record<string, unknown>>): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.featureType !== undefined) {
    fields.push('linked_feature_id = ?');
    values.push(updates.featureType);
  }
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Get ticket counts */
export async function getTicketCounts(): Promise<{ open: number; in_progress: number; closed: number }> {
  const db = getDb();
  return db.prepare(`SELECT 
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
    SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
  FROM tickets`).get() as { open: number; in_progress: number; closed: number };
}

/** Create a ticket and return the inserted ID. */
export async function createTicket(data: Parameters<typeof saveTicket>[0]): Promise<{ id: number }> {
  await saveTicket(data);
  const row = getDb().prepare('SELECT id FROM tickets WHERE provider = ? AND ticket_id = ?').get(
    data.provider,
    data.ticketId
  ) as { id: number };
  return { id: row.id };
}
