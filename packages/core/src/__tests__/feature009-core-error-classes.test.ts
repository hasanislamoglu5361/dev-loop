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

  it('every exported subclass preserves its own instanceof chain (BUG034)', () => {
    expect(new errs.ConfigError('bad')).toBeInstanceOf(errs.ConfigError);
    expect(new errs.DatabaseError('bad')).toBeInstanceOf(errs.DatabaseError);
    expect(new errs.ModelError('bad')).toBeInstanceOf(errs.ModelError);
    expect(new errs.VerifierError('bad')).toBeInstanceOf(errs.VerifierError);
    expect(new errs.PlanningError('bad')).toBeInstanceOf(errs.PlanningError);
    expect(new errs.MigrationAbortedError()).toBeInstanceOf(errs.MigrationAbortedError);

    // Every subclass must also still satisfy the base class check.
    expect(new errs.ConfigError('bad')).toBeInstanceOf(errs.DevLoopError);
    expect(new errs.DatabaseError('bad')).toBeInstanceOf(errs.DevLoopError);
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
    const err = new errs.DatabaseError('failed to query', undefined, undefined, dbErr);
    expect(err.message).toBe('failed to query');
    expect(err.code).toBe('database.error');
    expect(err.cause).toBe(dbErr);
  });

  it('DatabaseError supports action and details like sibling error classes (BUG034)', () => {
    const cause = new Error('connection refused');
    const err = new errs.DatabaseError('query failed', 'Retry the migration', { table: 'loop_history' }, cause);

    expect(err).toBeInstanceOf(errs.DatabaseError);
    expect(err.code).toBe('database.error');
    expect(err.action).toBe('Retry the migration');
    expect(err.details).toEqual({ table: 'loop_history' });
    expect(err.cause).toBe(cause);
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

  it('redacts secret-like keys from toJSON details, including nested objects (BUG034)', () => {
    const err = new errs.DevLoopError('bad', 'config.error', 'Fix config', {
      apiKey: 'sk-live-1234567890',
      nested: { token: 'secret-token-value', file: 'dev-loop.yaml' },
    });

    expect(err.toJSON()).toEqual({
      message: 'bad',
      code: 'config.error',
      action: 'Fix config',
      details: {
        apiKey: '[REDACTED]',
        nested: { token: '[REDACTED]', file: 'dev-loop.yaml' },
      },
    });
  });

  it('redacts password/secret/authorization keys and leaves normal fields untouched (BUG034)', () => {
    const err = new errs.DevLoopError('bad', 'x', undefined, {
      password: 'hunter2',
      secret: 'shh',
      authorization: 'Bearer xyz',
      normalField: 'keep-me',
    });

    expect(err.toJSON().details).toEqual({
      password: '[REDACTED]',
      secret: '[REDACTED]',
      authorization: '[REDACTED]',
      normalField: 'keep-me',
    });
  });

  // ---- Stack is preserved from native Error ----

  it('DevLoopError preserves a stack trace', () => {
    const err = new errs.DevLoopError('stack test', 'stack.check');
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe('string');
    expect(err.stack!.length).toBeGreaterThan(10);
  });
});