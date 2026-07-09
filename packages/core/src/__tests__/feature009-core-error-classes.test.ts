// TDD: Tests written FIRST - these should fail because errors.ts doesn't exist yet
import { describe, expect, it } from 'vitest';
import * as errs from '../errors.js';

describe('FEATURE009 - Core Error Classes', () => {
  // ---- Base DevLoopError ----

  it('DevLoopError has correct message and code', () => {
    const err = new errs.DevLoopError('something broke', 'config.load');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('config.load');
    expect(err.name).toBe('DevLoopError');
  });

  it('DevLoopError has action and details properties (signature: message, code, action?, details?)', () => {
    const err = new errs.DevLoopError('bad config', 'init.action', undefined, { file: '/tmp/x.json' });
    expect(err.code).toBe('init.action');
    expect(err.details).toEqual({ file: '/tmp/x.json' });
  });

  it('DevLoopError preserves cause chain (signature: message, code?, action?, details?, cause?)', () => {
    const original = new Error('root cause');
    const err = new errs.DevLoopError('wrapper', 'test.code', undefined, undefined, original);
    expect(err.cause).toBe(original);
  });

  it('ConfigError is instance of DevLoopError and Error', () => {
    const err = new errs.ConfigError('bad config');
    expect(err).toBeInstanceOf(errs.DevLoopError);
    expect(err).toBeInstanceOf(Error);
  });

  // ---- ConfigError ----

  it('ConfigError has code "config.error"', () => {
    const err = new errs.ConfigError('missing key');
    expect(err.code).toBe('config.error');
    expect(err.name).toBe('ConfigError');
  });

  // ---- DatabaseError ----

  it('DatabaseError preserves original error as cause', () => {
    const dbErr = new Error('connection refused');
    const err = new errs.DatabaseError('failed to query', dbErr);
    expect(err.message).toBe('failed to query');
    expect(err.code).toBe('database.error');
    expect(err.cause).toBe(dbErr);
  });

  // ---- ModelError ----

  it('ModelError has code "model.error"', () => {
    const err = new errs.ModelError('timeout');
    expect(err.message).toBe('timeout');
    expect(err.code).toBe('model.error');
    expect(err.name).toBe('ModelError');
  });

  // ---- VerifierError ----

  it('VerifierError has code "verifier.error"', () => {
    const err = new errs.VerifierError('tests failed');
    expect(err.message).toBe('tests failed');
    expect(err.code).toBe('verifier.error');
    expect(err.name).toBe('VerifierError');
  });

  // ---- PlanningError ----

  it('PlanningError has code "planning.error"', () => {
    const err = new errs.PlanningError('max iterations reached');
    expect(err.message).toBe('max iterations reached');
    expect(err.code).toBe('planning.error');
    expect(err.name).toBe('PlanningError');
  });

  // ---- MigrationAbortedError ----

  it('MigrationAbortedError has code "migration.aborted"', () => {
    const err = new errs.MigrationAbortedError();
    expect(err.code).toBe('migration.aborted');
    expect(err.name).toBe('MigrationAbortedError');
    expect(err.message).toContain('aborted');
  });

  // ---- Safe serialization (no secrets in stack) ----

  it('toJSON returns safe object with message and code, no stack (signature: msg, code?, action?, details?)', () => {
    const err = new errs.DevLoopError('oops', 'test.action', undefined, { sensitive: 'secret' });
    const json = err.toJSON();
    expect(json.message).toBe('oops');
    expect(json.code).toBe('test.action');
    // Should NOT have stack in JSON output
    expect((json as unknown as Record<string, unknown>).stack).toBeUndefined();
  });

  // ---- Stack is preserved from native Error ----

  it('DevLoopError preserves a stack trace', () => {
    const err = new errs.DevLoopError('stack test', 'stack.check');
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe('string');
    expect(err.stack!.length).toBeGreaterThan(10);
  });
});