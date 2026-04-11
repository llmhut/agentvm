# RFC-003: Event Schema Specification

> **Status:** accepted
>
> **Author:** AgentVM Core Team
>
> **Created:** 2026-03-30
>
> **Updated:** 2026-04-11

## Summary

Defines the canonical set of events emitted by the AgentVM kernel, their payload shapes, and the contract for event consumers (observability tools, dashboards, loggers).

## Motivation

AgentVM is observable by default — every operation emits a structured event. This RFC specifies what those events are, what data they carry, and what guarantees consumers can rely on. Without a formal schema, event consumers are fragile to internal changes.

## Detailed Design

### Base Event Shape

All events share this structure:

```typescript
interface KernelEvent {
  id: string;        // Unique event ID: "evt-<timestamp>-<random>"
  type: string;      // Namespaced event type (see table below)
  source: string;    // Kernel name (from KernelConfig.name)
  timestamp: Date;   // Wall-clock time the event was emitted
  data?: unknown;    // Event-specific payload (typed per event below)
}
```

### Canonical Event Catalog

#### Kernel Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `kernel:started` | `new Kernel()` constructor completes | `{ name: string }` |
| `kernel:shutdown` | `kernel.shutdown()` completes | `{ name: string }` |

#### Agent Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `agent:registered` | `kernel.register(agent)` | `{ name: string }` |
| `agent:unregistered` | `kernel.unregister(agentName)` | `{ name: string }` |
| `agent:<custom>` | `ctx.emit(event, data)` inside a handler | `{ processId, agentName, data }` |

#### Process Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `process:spawned` | `kernel.spawn()` returns | `{ id: string, agentName: string }` |
| `process:paused` | `kernel.pause()` | `{ id: string }` |
| `process:resumed` | `kernel.resume()` | `{ id: string }` |
| `process:terminated` | `kernel.terminate()` | `{ id: string }` |
| `process:crashed` | Handler throws unhandled error | `{ id: string, error: string }` |

#### Execution Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `execution:started` | `kernel.execute()` begins | `{ processId, agentName, task: string }` |
| `execution:completed` | Handler resolves | `{ processId, agentName, duration: number }` |
| `execution:failed` | Handler rejects | `{ processId, agentName, duration: number, error: string }` |

#### Tool Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `tool:registered` | `kernel.registerTool()` | `{ name: string }` |
| `tool:invoked` | `ctx.useTool()` is called | `{ processId, agentName, tool: string }` |
| `tool:completed` | Tool handler resolves | `{ processId, tool: string }` |

#### Message Events

| Event type | Emitted when | `data` shape |
|------------|--------------|--------------|
| `channel:created` | `kernel.createChannel()` | `{ name: string }` |
| `message:published` | `ctx.publish()` is called | `{ processId, channel: string }` |

#### LLM Agent Events (emitted via `ctx.emit`)

These are emitted by `createLLMAgent()` as `agent:llm:call` etc. (prefixed `agent:` by the kernel):

| `ctx.emit()` type | Emitted when | `data` shape |
|-------------------|--------------|--------------|
| `llm:call` | Each LLM API call begins | `{ turn: number, messageCount: number }` |
| `llm:response` | LLM API call resolves | `{ turn, stopReason, toolCalls: number, usage: { inputTokens, outputTokens } }` |
| `tool:call` | LLM requests a tool | `{ name: string, args: unknown }` |

### Subscription API

```typescript
// Subscribe to a specific event type
const unsubscribe = kernel.on('process:spawned', (event) => { ... });
unsubscribe(); // remove the listener

// Subscribe to ALL events
kernel.onAny((event) => { ... });

// Pass handlers at construction time
const kernel = new Kernel({
  on: {
    'execution:completed': (e) => metrics.record(e.data.duration),
    '*': (e) => logger.info(e.type, e.data),
  }
});
```

### Guarantees

1. Every operation in the catalog above WILL emit its event — this is a behavioral contract, not best-effort.
2. Event handlers are called synchronously before `kernel.execute()` / `kernel.spawn()` etc. return, except for async handlers (which are called but not awaited — fire-and-forget).
3. Errors thrown inside event handlers are silently swallowed — a bad logger must not crash the kernel.
4. The `id` field is unique within a process lifetime but not across restarts or distributed instances.
5. `data` shapes are backward-compatible within a minor version. Fields may be added; existing fields will not be removed or renamed without a major version bump.

## Trade-offs

- **Sync delivery**: Handlers block the emit call. For CPU-heavy handlers, use `setImmediate`. We chose sync over async-by-default to keep event ordering deterministic.
- **No event replay**: Events are not persisted. Use `kernel.onAny()` with your own store if you need replay. Checkpointing (v0.3.0) will address process state recovery independently.
- **No event filtering at the bus level**: Consumers receive all events and filter themselves. A pub/sub topic model would add complexity without clear benefit at this scale.

## Alternatives Considered

- **AsyncIterator / stream API**: Cleaner for high-volume consumers but incompatible with synchronous handler registration patterns.
- **EventEmitter (Node.js built-in)**: Familiar but not typed, no structured `data` field, no `id`/`timestamp` on events.

## References

- `src/core/kernel.ts` — `_emit()` implementation
- `src/core/types.ts` — `KernelEvent`, `EventHandler`
- [RFC-001: Process State Machine Design](./RFC-001-PROCESS-STATE-MACHINE.md)
