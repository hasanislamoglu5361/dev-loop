import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from '../useWebSocket.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  triggerMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

let originalWebSocket: unknown;

beforeEach(() => {
  FakeWebSocket.instances = [];
  originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
});

function Harness({ onResult }: { onResult: (result: ReturnType<typeof useWebSocket>) => void }): null {
  const result = useWebSocket({ maxReconnectAttempts: 0 });
  onResult(result);
  return null;
}

describe('FEATURE097 - useWebSocket onEvent', () => {
  it('returns onEvent, dispatches matching events, and unregisters on cleanup', () => {
    let latest: ReturnType<typeof useWebSocket> | undefined;

    act(() => {
      create(<Harness onResult={result => { latest = result; }} />);
    });

    expect(typeof latest?.onEvent).toBe('function');

    const handler = vi.fn();
    let unregister: (() => void) | undefined;
    act(() => {
      unregister = latest!.onEvent('loop:start', handler);
    });

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();

    act(() => {
      ws.triggerMessage({ type: 'loop:start', loopId: 'loop-1' });
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'loop:start', loopId: 'loop-1' }));

    handler.mockClear();
    act(() => {
      unregister?.();
    });
    act(() => {
      ws.triggerMessage({ type: 'loop:start', loopId: 'loop-2' });
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
