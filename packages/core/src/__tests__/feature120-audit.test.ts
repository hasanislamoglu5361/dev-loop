import { mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initDatabase } from '../db/connection.js';
import { appendAuditEvent, queryAuditEvents, verifyAuditChain, withAuditedTransaction } from '../db/queries/audit.js';
const dirs: string[] = []; afterEach(() => { closeDatabase(); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
function setup() { const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-audit-')); dirs.push(dir); return initDatabase(path.join(dir, 'db.sqlite')); }
describe('FEATURE120 audit persistence', () => {
  it('creates a canonical redacted tamper-evident chain', () => { setup(); appendAuditEvent({ eventType: 'model.call', loopId: 1, payload: { token: 'secret', z: 1, a: 'sk-abcdefghijklmnop' } }); appendAuditEvent({ eventType: 'quality.decision', loopId: 1, payload: { passed: false } }); const rows = queryAuditEvents({ loopId: 1 }); expect(JSON.stringify(rows)).not.toContain('secret'); expect(rows[1].previousSignature).toBe(rows[0].signature); expect(verifyAuditChain()).toEqual({ valid: true }); });
  it('detects payload tampering', () => { const db = setup(); const row = appendAuditEvent({ eventType: 'test.run', payload: { passed: true } }); db.prepare('UPDATE audit_log SET payload = ? WHERE id = ?').run('{"passed":false}', row.id); expect(verifyAuditChain()).toEqual({ valid: false, invalidId: row.id }); });
  it('rolls back both compound mutation and audit on failure', () => { const db = setup(); expect(() => withAuditedTransaction({ eventType: 'compound.update' }, () => { db.prepare("INSERT INTO planning_history (feature_id) VALUES ('F1')").run(); throw new Error('injected failure'); })).toThrow('injected failure'); expect((db.prepare('SELECT COUNT(*) count FROM planning_history').get() as { count: number }).count).toBe(0); expect(queryAuditEvents()).toEqual([]); });
});
