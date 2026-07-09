// Tests for FEATURE010 - Typed Event Bus
// Verifies event delivery, listener removal, once behavior, and payload typing.

import { describe, expect, it } from 'vitest';
import { EventBus, type EventPayloadMap, type EventName } from '../events.js';

describe('FEATURE010 - Typed Event Bus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers events to listeners on emit', () => {
    const received: string[] = [];
    bus.on('loop:start', (payload) => {
      received.push(payload.loopId);
    });

    bus.emit('loop:start', { loopId: 'loop-1' });
    bus.emit('loop:start', { loopId: 'loop-2' });

    expect(received).toEqual(['loop-1', 'loop-2']);
  });

  it('removes a listener when off is called', () => {
    let count = 0;
    const listener = (_payload: EventPayloadMap['loop:start']) => {
      count++;
    };

    bus.on('loop:start', listener);
    bus.emit('loop:start', { loopId: 'a' });
    expect(count).toBe(1);

    bus.off('loop:start', listener);
    bus.emit('loop:start', { loopId: 'b' });
    expect(count).toBe(1); // unchanged after off
  });

  it('removes a listener via the unsubscribe function returned by on()', () => {
    let count = 0;
    const unsub = bus.on('loop:end', (_payload) => {
      count++;
    });

    bus.emit('loop:end', { loopId: 'x', success: true, durationMs: 100 });
    expect(count).toBe(1);

    unsub();
    bus.emit('loop:end', { loopId: 'y', success: false });
    expect(count).toBe(1); // unchanged after unsubscribe
  });

  it('calls once listener only on the first emit and then removes it', () => {
    const received: string[] = [];
    bus.once('model:switch', (payload) => {
      received.push(payload.model);
    });

    bus.emit('model:switch', { provider: 'ollama', model: 'qwen' });
    bus.emit('model:switch', { provider: 'openai', model: 'gpt-4' });

    expect(received).toEqual(['qwen']);
  });

  it('removes all listeners for a specific event via removeAllListeners(name)', () => {
    const received1: string[] = [];
    const received2: string[] = [];

    bus.on('notification', (payload) => {
      received1.push(payload.message);
    });
    bus.on('notification', (payload) => {
      received2.push(payload.message);
    });

    bus.removeAllListeners('notification');

    bus.emit('notification', { level: 'info', message: 'test' });

    expect(received1).toEqual([]);
    expect(received2).toEqual([]);
  });

  it('removes all listeners for all events via removeAllListeners()', () => {
    const received: string[] = [];
    bus.on('loop:start', (payload) => {
      received.push(payload.loopId);
    });
    bus.on('notification', (_p) => {
      // ignored
    });

    bus.removeAllListeners();

    bus.emit('loop:start', { loopId: 'z' });
    expect(received).toEqual([]);
  });

  it('handles events with no listeners gracefully (no error)', () => {
    expect(() => {
      bus.emit('uncertain:tag', { tags: ['low-confidence'] });
    }).not.toThrow();
  });

  it('supports multiple listeners for the same event', () => {
    const calls1: number[] = [];
    const calls2: number[] = [];
    let counter = 0;

    bus.on('benchmark:progress', (_p) => {
      calls1.push(++counter);
    });
    bus.on('benchmark:progress', (_p) => {
      calls2.push(counter);
    });

    bus.emit('benchmark:progress', { progress: 1, total: 3 });
    bus.emit('benchmark:progress', { progress: 2, total: 3 });

    expect(calls1).toEqual([1, 2]);
    expect(calls2).toEqual([1, 2]);
  });

  it('passes typed payload to listeners (compile-time type check)', () => {
    bus.on('mcp:error', (payload) => {
      // TypeScript should require serverName and error fields
      const _: string = payload.serverName;
      const __: string = payload.error;
      void _;
      void __;
    });

    expect(() => {
      bus.emit('mcp:error', { serverName: 'test-server', error: 'connection failed' });
    }).not.toThrow();
  });

  it('payload typing rejects wrong event name at compile time (negative type test)', () => {
    // @ts-expect-error - loop:start payload does not have provider/model fields; must be compatible with EventPayloadMap['loop:start']
    const badPayload: EventPayloadMap['loop:start'] = { provider: 'ollama', model: 'qwen' };
    expect(badPayload).toBeDefined();
  });

  it('quality:gate event delivers correct payload', () => {
    const received: EventPayloadMap['quality:gate'][] = [];
    bus.on('quality:gate', (payload) => {
      received.push(payload);
    });

    bus.emit('quality:gate', { passRate: 0.95, gateId: 'gate-1' });

    expect(received).toEqual([{ passRate: 0.95, gateId: 'gate-1' }]);
  });

  it('notification event delivers info/warn/error levels', () => {
    const levels: string[] = [];
    bus.on('notification', (payload) => {
      levels.push(payload.level);
    });

    bus.emit('notification', { level: 'info', message: 'ready' });
    bus.emit('notification', { level: 'warn', message: 'slow' });
    bus.emit('notification', { level: 'error', message: 'fail' });

    expect(levels).toEqual(['info', 'warn', 'error']);
  });
});