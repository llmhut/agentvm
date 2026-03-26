# Architecture Overview

## Design Principles

1. **Modular** — Every component (memory, tools, broker, scheduler) is independent and replaceable.
2. **Event-driven** — All operations emit structured events. Observability is built in, not bolted on.
3. **Framework-agnostic** — No opinions about LLMs, prompting strategies, or agent reasoning.
4. **Async-first** — All I/O operations are non-blocking. The scheduler handles concurrency.
5. **Type-safe** — Full TypeScript with strict mode. Runtime validation at boundaries.

## Component Diagram

```
                         ┌──────────────────────┐
                         │     User Code /       │
                         │   Agent Framework     │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │       Kernel          │
                         │   (Orchestrator)      │
                         └──┬───┬───┬───┬───┬───┘
                            │   │   │   │   │
              ┌─────────────┘   │   │   │   └─────────────┐
              │           ┌─────┘   │   └─────┐           │
              ▼           ▼         ▼         ▼           ▼
        ┌──────────┐┌──────────┐┌────────┐┌──────────┐┌──────────┐
        │ Process  ││  Memory  ││  Tool  ││ Message  ││Scheduler │
        │ Manager  ││   Bus    ││ Router ││  Broker  ││          │
        └──────────┘└──────────┘└────────┘└──────────┘└──────────┘
```

## Data Flow

### Spawning an Agent

```
kernel.spawn('researcher')
  → Validate agent is registered
  → Check process limit
  → Create Process instance (state: created)
  → Transition to 'starting'
  → Allocate working memory namespace
  → Transition to 'running'
  → Emit 'process:spawned' event
  → Return Process handle
```

### Tool Invocation

```
context.useTool('web_search', { query: '...' })
  → ToolRouter.invoke()
  → Check tool exists
  → Check agent has permission
  → Check rate limit
  → Execute handler in sandbox
  → Emit 'tool:invoked' event
  → Return result
```

### Message Passing

```
agent1.publish('updates', data)
  → MessageBroker.publish()
  → Validate channel exists
  → Create Message object
  → Store in channel history
  → Deliver to all subscribers (except sender)
  → Emit 'message:published' event
```

## Process State Machine

```
         ┌──────────┐
         │ Created  │
         └────┬─────┘
              │ _start()
         ┌────▼─────┐
         │ Starting │
         └────┬─────┘
              │
         ┌────▼─────┐     _pause()    ┌────────┐
         │ Running  │ ──────────────► │ Paused │
         └────┬─────┘ ◄────────────── └────────┘
              │            _resume()
              │
    ┌─────────┼─────────┐
    │ _terminate()       │ _crash()
    ▼                    ▼
┌────────────┐    ┌─────────┐
│ Terminated │    │ Crashed │
└────────────┘    └─────────┘
```

## Memory Architecture

```
                    MemoryBus
                    ┌──────────────────────────┐
                    │                          │
    Process A ──►   │  Namespace: "proc-a"     │  ◄── Isolated
                    │  ┌─────────────────┐     │
                    │  │ key → value     │     │
                    │  └─────────────────┘     │
                    │                          │
    Process B ──►   │  Namespace: "proc-b"     │  ◄── Isolated
                    │  ┌─────────────────┐     │
                    │  │ key → value     │     │
                    │  └─────────────────┘     │
                    │                          │
    Any Process ──► │  Namespace: "__shared__"  │  ◄── Shared
                    │  ┌─────────────────┐     │
                    │  │ key → value     │     │
                    │  └─────────────────┘     │
                    └──────────────────────────┘
```

## Event System

Every operation in AgentKernel emits a structured event:

```typescript
interface KernelEvent {
  id: string;        // Unique event ID
  type: string;      // e.g., 'process:spawned', 'tool:invoked'
  source: string;    // Emitter ID (kernel name or process ID)
  timestamp: Date;   // When it happened
  data?: unknown;    // Event-specific payload
}
```

### Event Types

| Event | Emitted When |
|-------|-------------|
| `kernel:started` | Kernel is initialized |
| `kernel:shutdown` | Kernel is shutting down |
| `agent:registered` | An agent definition is registered |
| `process:spawned` | A new process is created and started |
| `process:paused` | A running process is paused |
| `process:resumed` | A paused process is resumed |
| `process:terminated` | A process is terminated |
| `process:crashed` | A process crashes due to an unhandled error |
| `tool:invoked` | A tool is called |
| `tool:completed` | A tool call completes |
| `tool:failed` | A tool call fails |
| `message:published` | A message is published to a channel |
| `memory:read` | A memory value is read |
| `memory:write` | A memory value is written |

This event stream is the foundation for observability tools like AgentTrace.
