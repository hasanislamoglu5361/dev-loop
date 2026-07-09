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
export type Listener<Name extends EventName> = (payload: EventPayloadMap[Name]) => void;

/**
 * Typed event bus with isolated instances.
 * Listeners are removed via off() or the unsubscribe function returned by on().
 */
export class EventBus {
  private listeners: {
    [Name in EventName]?: Set<Listener<Name>>;
  } = {};

  /**
   * Subscribe to an event. Returns a function that removes the listener when called.
   */
  on<Name extends EventName>(name: Name, listener: Listener<Name>): () => void {
    const set = this.getListenerSet(name);
    set.add(listener);

    return () => {
      this.off(name, listener);
    };
  }

  /**
   * Remove a specific listener for an event.
   */
  off<Name extends EventName>(name: Name, listener: Listener<Name>): void {
    this.listeners[name]?.delete(listener);
  }

  /**
   * Emit an event with the given payload. All listeners for the event name are called synchronously.
   */
  emit<Name extends EventName>(name: Name, payload: EventPayloadMap[Name]): void {
    const set = this.listeners[name] as Set<Listener<Name>> | undefined;
    if (set) {
      for (const listener of set) {
        listener(payload);
      }
    }
  }

  /**
   * Remove all listeners for an event.
   */
  removeAllListeners<Name extends EventName>(name?: Name): void {
    if (name !== undefined) {
      delete this.listeners[name];
    } else {
      this.listeners = {};
    }
  }

  private getListenerSet<Name extends EventName>(name: Name): Set<Listener<Name>> {
    const listeners = this.listeners as Record<string, Set<Listener<Name>> | undefined>;
    listeners[name] ??= new Set<Listener<Name>>();
    return listeners[name];
  }
}
