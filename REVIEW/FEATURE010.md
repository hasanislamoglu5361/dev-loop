# FEATURE010 - Typed Event Bus Review

## Summary

Implemented a typed event bus for loop/model/MCP/UI updates with full TypeScript generic type safety. The EventBus class provides `on`, `off`, `once`, and `emit` methods bound to the `EventPayloadMap`.

## Changes Made

### 1. Added `once` method to `packages/core/src/events.ts`
The `once` method subscribes a listener that is automatically removed after being called once:
```typescript
once<Name extends EventName>(name: Name, listener: Listener<Name>): void {
  const wrapped = (payload: EventPayloadMap[Name]) => {
    this.off(name, wrapped);
    listener(payload);
  };
  this.on(name, wrapped);
}
```

### 2. Created test file `packages/core/src/__tests__/feature010-typed-event-bus.test.ts`
- Event delivery to listeners on emit
- Listener removal via `off()` and unsubscribe function from `on()`
- `once` behavior (fires exactly once, then auto-removes)
- `removeAllListeners(name)` for specific event cleanup
- `removeAllListeners()` for global cleanup
- Graceful handling when no listeners exist
- Multiple listeners for same event
- Typed payload enforcement at compile time
- Negative type test ensuring wrong payloads are rejected

## Verification Results

```bash
npm test -- packages/core/src/__tests__/feature010-typed-event-bus.test.ts
```
- 12 tests passed (all green)

```bash
npm run typecheck
```
- Passed with no errors

## Acceptance Criteria Met

- ✅ Core and UI backend can share event names safely via the typed `EventPayloadMap`
- ✅ Each listener is bound to its specific event name/payload type at compile time
- ✅ Isolated instances are supported (not global-only)
- ✅ No leaked listeners: each `on()` returns an unsubscribe function, `once` auto-removes

## Common Mistakes Avoided
- Used typed string maps with generics (not untyped everywhere)
- Listeners removed via `off()`, unsubscribe return value, and `removeAllListeners()` - no leaks in tests
- EventBus is not global; each instance is independent