// Typed event bus for dev-loop loop/model/MCP/UI updates

/**
 * Payload map defining types for each event name.
 * All events used across core modules are declared here.
 */
export interface EventPayloadMap {
  'loop:start': { loopId: string };
  'loop:end': { loopId: string; success: boolean; durationMs?: number };
  'loop:error': { loopId: string; error: unknown };

  'model:switch': { provider: string; model: string };

  'mcp:error': { serverName: string; error: string };

  'uncertain:tag': { tags: string[] };

  'quality:gate': { passRate: number; gateId: string };

  'benchmark:progress': { progress: number; total: number };

  'notification': { level: 'info' | 'warn' | 'error'; message: string };
}

export type EventName = keyof EventPayloadMap;
export type Listener<T extends EventPayloadMap[keyof EventPayloadMap]> = (payload: T) => void;

/**
 * Typed event bus with isolated instances.
 * Listeners are removed via off() or the unsubscribe function returned by on().
 */
export class EventBus {
  private listeners = new Map<EventName, Set<Listener<any>>>();

  /**
   * Subscribe to an event. Returns a function that removes the listener when called.
   */
  on<T extends EventPayloadMap[keyof EventPayloadMap]>(name: EventName, listener: Listener<T>): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    const set = this.listeners.get(name)!;
    set.add(listener as Listener<any>);

    return () => {
      this.off(name, listener as Listener<any>);
    };
  }

  /**
   * Remove a specific listener for an event.
   */
  off<T extends EventPayloadMap[keyof EventPayloadMap]>(name: EventName, listener: Listener<T>): void {
    const set = this.listeners.get(name);
    if (set) {
      set.delete(listener as Listener<any>);
    }
  }

  /**
   * Emit an event with the given payload. All listeners for the event name are called synchronously.
   */
  emit<T extends EventPayloadMap[keyof EventPayloadMap]>(name: EventName, payload: T): void {
    const set = this.listeners.get(name);
    if (set) {
      for (const listener of set) {
        listener(payload);
      }
    }
  }

  /**
   * Remove all listeners for an event.
   */
  removeAllListeners(name?: EventName): void {
    if (name !== undefined) {
      this.listeners.delete(name);
    } else {
      this.listeners.clear();
    }
  }
}