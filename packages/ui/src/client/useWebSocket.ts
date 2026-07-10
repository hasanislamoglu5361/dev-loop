import { useCallback, useEffect, useRef, useState } from 'react';

type WebSocketEvent = 'status' | 'loop:start' | 'loop:end' | 'anomaly' | 'metric-update';

interface UseWebSocketOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enabled?: boolean;
}

interface UseWebSocketResult<T = unknown> {
  data: T | null;
  isConnected: boolean;
  lastMessage: MessageEvent | null;
  sendMessage: (message: string) => void;
  clearData: () => void;
  onEvent: (event: WebSocketEvent, handler: EventHandler) => () => void;
}

type EventHandler = (data: unknown) => void;

export function useWebSocket<T = unknown>(options?: UseWebSocketOptions): UseWebSocketResult<T> {
  const {
    url = 'ws://localhost/ws',
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    enabled = true,
  } = options ?? {};

  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event: MessageEvent) => {
          setLastMessage(event);
          try {
            const parsed = JSON.parse(event.data);
            if (typeof parsed?.sequence === 'number') {
              if (parsed.sequence <= lastSequenceRef.current) return;
              lastSequenceRef.current = parsed.sequence;
            }
            setData(parsed as T);

            // Dispatch to registered event handlers
            const eventType = parsed?.event?.type ?? parsed?.type;
            if (eventType && eventHandlersRef.current.has(eventType)) {
              eventHandlersRef.current.get(eventType)!.forEach(handler => handler(parsed.event ?? parsed));
            }
          } catch {
            // Non-JSON message, pass raw data
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;

          if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
            const attempt = ++reconnectAttemptsRef.current;
            setTimeout(connect, reconnectInterval * attempt);
          }
        };

        ws.onerror = () => {
          // onclose will be called after onerror
        };
      } catch (err) {
        console.error('[WebSocket] Connection failed:', err);
      }
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, url, reconnectInterval, maxReconnectAttempts]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setLastMessage(null);
  }, []);

  // Utility to register event handlers
  const onEvent = useCallback((event: WebSocketEvent, handler: EventHandler) => {
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)!.add(handler);

    return () => {
      eventHandlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  return { data, isConnected, lastMessage, sendMessage, clearData, onEvent };
}

export default useWebSocket;
