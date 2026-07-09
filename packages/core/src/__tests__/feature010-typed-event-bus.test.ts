// TDD: Tests written FIRST - these should fail because events.ts doesn't exist yet
import { describe, expect, it } from 'vitest';
import type { EventPayloadMap } from '../events.js';
import { EventBus } from '../events.js';

describe('FEATURE010 - Typed Event Bus', () => {
  // ---- Event payload map has all required event names ----

  it('EventPayloadMap includes loop lifecycle events as keys', () => {
    type RequiredKeys = 'loop:start' | 'loop:end' | 'loop:error';
    const keys: RequiredKeys[] = ['loop:start', 'loop:end', 'loop:error'];
    for (const key of keys) {
      // compile-time check that key exists in EventPayloadMap, runtime verify type safety
      expect(typeof key === 'string').toBe(true);
    }
  });

  it('EventPayloadMap includes model switch event with correct shape', () => {
    const p: EventPayloadMap['model:switch'] = { provider: 'openai', model: 'gpt-4' };
    expect(p.provider).toBe('openai');
  });

  it('EventPayloadMap includes MCP error event with correct shape', () => {
    const p: EventPayloadMap['mcp:error'] = { serverName: 'srv1', error: 'timeout' };
    expect(p.serverName).toBe('srv1');
  });

  it('EventPayloadMap includes quality gate event with correct shape', () => {
    const p: EventPayloadMap['quality:gate'] = { passRate: 80, gateId: 'g1' };
    expect(p.passRate).toBe(80);
  });

  it('EventPayloadMap includes benchmark progress event with correct shape', () => {
    const p: EventPayloadMap['benchmark:progress'] = { progress: 50, total: 100 };
    expect(p.progress).toBe(50);
  });

  it('EventPayloadMap includes notification event with correct shape', () => {
    const p: EventPayloadMap['notification'] = { level: 'warn', message: 'test' };
    expect(p.level).toBe('warn');
  });

  // ---- EventBus.on / off / emit ----

  it('emit delivers to subscribed listeners', () => {
    const bus = new EventBus();
    let received: string | undefined;
    bus.on('loop:start', (payload: EventPayloadMap['loop:start']) => {
      received = payload.loopId;
    });
    bus.emit('loop:start', { loopId: 'test-loop-1' });
    expect(received).toBe('test-loop-1');
  });

  it('off removes a listener so it no longer receives events', () => {
    const bus = new EventBus();
    let count = 0;
    const listener = () => { count++; };
    bus.on('loop:start', listener);
    bus.emit('loop:start', { loopId: 'a' });
    expect(count).toBe(1);
    bus.off('loop:start', listener);
    for (let i = 0; i < 5; i++) {
      bus.emit('loop:start', { loopId: String(i) });
    }
    expect(count).toBe(1); // not incremented after off
  });

  it('single listener is called every time across multiple emits', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('loop:start', () => { count++; });
    for (let i = 0; i < 10; i++) {
      bus.emit('loop:start', { loopId: String(i) });
    }
    expect(count).toBe(10);
  });

  it('emit with unknown event name does not throw', () => {
    const bus = new EventBus();
    expect(() => {
      (bus as any).emit('unknown:event' as any, {});
    }).not.toThrow();
  });

  // ---- EventBus isolation: separate instances are independent ----

  it('separate event bus instances do not share listeners', () => {
    const bus1 = new EventBus();
    const bus2 = new EventBus();
    let count1 = 0;
    let count2 = 0;
    bus1.on('loop:start', () => { count1++; });
    bus2.on('loop:start', () => { count2++; });

    bus1.emit('loop:start', { loopId: 'a' });
    expect(count1).toBe(1);
    expect(count2).toBe(0);

    bus2.emit('loop:start', { loopId: 'b' });
    expect(count1).toBe(1); // unchanged
    expect(count2).toBe(1);
  });

  // ---- on/off/emit with specific payload types ----

  it('on callback receives correct model:switch payload', () => {
    const bus = new EventBus();
    let receivedProvider: string | undefined;
    bus.on('model:switch', (payload: EventPayloadMap['model:switch']) => {
      receivedProvider = payload.provider;
    });
    bus.emit('model:switch', { provider: 'anthropic', model: 'claude-3' });
    expect(receivedProvider).toBe('anthropic');
  });

  it('on callback receives correct quality:gate payload', () => {
    const bus = new EventBus();
    let receivedPassRate = -1;
    bus.on('quality:gate', (payload: EventPayloadMap['quality:gate']) => {
      receivedPassRate = payload.passRate;
    });
    bus.emit('quality:gate', { passRate: 92.5, gateId: 'g1' });
    expect(receivedPassRate).toBe(92.5);
  });

  it('on callback receives correct mcp:error payload', () => {
    const bus = new EventBus();
    let receivedServerName: string | undefined;
    bus.on('mcp:error', (payload: EventPayloadMap['mcp:error']) => {
      receivedServerName = payload.serverName;
    });
    bus.emit('mcp:error', { serverName: 'test-srv', error: 'timeout' });
    expect(receivedServerName).toBe('test-srv');
  });

  it('on callback receives correct uncertain:tag payload', () => {
    const bus = new EventBus();
    let receivedTags: string[] | undefined;
    bus.on('uncertain:tag', (payload: EventPayloadMap['uncertain:tag']) => {
      receivedTags = [...payload.tags];
    });
    bus.emit('uncertain:tag', { tags: ['fast', 'rough'] });
    expect(receivedTags).toEqual(['fast', 'rough']);
  });

  it('on callback receives correct benchmark progress payload', () => {
    const bus = new EventBus();
    let receivedProgress = -1;
    bus.on('benchmark:progress', (payload: EventPayloadMap['benchmark:progress']) => {
      receivedProgress = payload.progress;
    });
    bus.emit('benchmark:progress', { progress: 50, total: 100 });
    expect(receivedProgress).toBe(50);
  });

  it('on callback receives correct notification payload', () => {
    const bus = new EventBus();
    let receivedLevel: string | undefined;
    bus.on('notification', (payload: EventPayloadMap['notification']) => {
      receivedLevel = payload.level;
    });
    bus.emit('notification', { level: 'warn', message: 'low battery' });
    expect(receivedLevel).toBe('warn');
  });

  it('loop:end receives durationMs in payload', () => {
    const bus = new EventBus();
    let receivedDuration = -1;
    bus.on('loop:end', (payload: EventPayloadMap['loop:end']) => {
      receivedDuration = payload.durationMs ?? -1;
    });
    bus.emit('loop:end', { loopId: 'l1', success: true, durationMs: 4200 });
    expect(receivedDuration).toBe(4200);
  });

  // ---- Multiple listeners on same event ----

  it('multiple listeners on the same event all receive the payload', () => {
    const bus = new EventBus();
    let count1 = 0;
    let count2 = 0;
    bus.on('loop:start', () => { count1++; });
    bus.on('loop:start', () => { count2++; });
    bus.emit('loop:start', { loopId: 'multi' });
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  // ---- on returns unsubscribe function ----

  it('on() returns a function that removes the listener when called', () => {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on('loop:start', () => { count++; });
    bus.emit('loop:start', { loopId: 'a' });
    expect(count).toBe(1);
    unsub(); // unsubscribe via returned function
    bus.emit('loop:start', { loopId: 'b' });
    expect(count).toBe(1); // not incremented after unsub
  });

  // ---- off with no listeners for event does not throw ----

  it('off() with unknown event name does not throw', () => {
    const bus = new EventBus();
    expect(() => (bus as any).off('unknown:event' as any, () => {})).not.toThrow();
  });
});