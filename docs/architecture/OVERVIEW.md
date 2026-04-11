# Architecture Overview

## Design Principles

1. **Modular** — Every component (memory, tools, broker, scheduler) is independent and replaceable.
2. **Event-driven** — All operations emit structured events. Observability is built in, not bolted on.
3. **Framework-agnostic** — No opinions about LLMs, prompting strategies, or agent reasoning.
4. **Async-first** — All I/O operations are non-blocking. The scheduler handles concurrency.
5. **Type-safe** — Full TypeScript with strict mode. Runtime validation at boundaries.

## Component Diagram

```
                      ┌──────────────────────────────────┐
                      │    Your Code / Agent Framework    │
                      └─────────────────┬────────────────┘
                                        │
              ┌─────────────────────────▼────────────────────────┐
              │                      Kernel                       │
              │              (Central Orchestrator)               │
              └──┬──────┬──────┬──────┬──────┬──────┬───────────┘
                 │      │      │      │      │      │
         ┌───────┘  ┌───┘  ┌───┘  ┌───┘  ┌───┘  ┌───┘
         ▼          ▼      ▼      ▼      ▼      ▼
    ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐ ┌──────────┐
    │ Process │ │Memory│ │ Tool │ │Broker│ │Sched- │ │LLM Agent │
    │ Manager │ │ Bus  │ │Router│ │      │ │ uler  │ │+ MCP     │
    └─────────┘ └──────┘ └──────┘ └──────┘ └───────┘ └──────────┘
                              │                           │
                    ┌─────────┘                 ┌─────────┘
                    ▼                           ▼
              ┌──────────┐              ┌──────────────┐
              │ Built-in │              │  MCP Servers  │
              │  Tools   │              │ (stdio / SSE) │
              └──────────┘              └──────────────┘
```

## Module Responsibilities

**Process Manager** — `Kernel` owns the `Process` registry. Each process is an isolated execution unit with its own lifecycle, metadata, and AbortSignal.

**Memory Bus** — Namespaced key-value store. Each process gets an isolated namespace. All processes can access `__shared__`. Pluggable backends (SQLite, Redis) coming in v0.3.0.

**Tool Router** — Central registry for tools. Handles registration, permission checking, rate limiting, and invocation. Agents declare which tools they can use; the kernel enforces this at execution time.

**Message Broker** — Pub/sub and direct channels for inter-agent communication. Typed messages, configurable history, subscriber error isolation.

**Scheduler** — Multi-strategy task execution: `sequential`, `parallel` (layer-based dependency resolution), `race`, `conditional`. Supports retry with fixed or exponential backoff.

**LLM Agent** — `createLLMAgent()` factory that wraps the Anthropic or OpenAI API in an agentic tool loop. Conversation history and token usage are stored in process memory.

**MCP Client** — Connects to MCP servers (stdio or SSE), discovers their tools, and auto-registers them with the `ToolRouter` as `mcp:<server>:<tool>`.

## Key Data Flows

### Spawning an agent

```
kernel.spawn('researcher')
  → Validate agent is registered
  → Check process limit (maxProcesses)
  → Create Process (state: created → running)
  → Allocate memory namespace
  → Inject __tool_schemas into process memory
  → Emit 'process:spawned'
  → Return Process handle
```

### Executing a task

```
kernel.execute(proc.id, { task: '...' })
  → Validate process is running
  → Build ExecutionContext (memory, useTool, publish, emit, signal)
  → Emit 'execution:started'
  → Call agent.handler(ctx)
    → ctx.useTool('x', params)
        → Check agent tool allowlist
        → Emit 'tool:invoked'
        → ToolRouter.invoke() → rate limit → handler()
        → Emit 'tool:completed'
        → Return result
    → ctx.publish('channel', data)
        → MessageBroker.publish()
        → Deliver to all channel subscribers
        → Emit 'message:published'
  → Emit 'execution:completed'
  → Return ExecutionResult
```

### LLM agentic loop

```
createLLMAgent handler(ctx)
  → Load conversation history from ctx.memory.__llm_messages
  → Append user message
  → Loop up to maxTurns:
      → Call Anthropic/OpenAI API with messages + tool schemas
      → Emit llm:call, llm:response via ctx.emit()
      → If tool_use in response:
          → ctx.useTool(name, args) for each tool call
          → Append tool results to history
      → If text response:
          → Set as finalResponse, break
  → Save updated history to ctx.memory.__llm_messages
  → Return finalResponse
```

### MCP tool discovery

```
mcp.connect({ name: 'filesystem', transport: 'stdio', command: 'npx', args: [...] })
  → Spawn child process
  → JSON-RPC initialize handshake
  → tools/list → discover MCPTool[]
  → resources/list → discover MCPResource[]
  → For each tool:
      → Register as ToolDefinition named mcp:filesystem:<tool.name>
      → handler: (params) => mcp.callTool(serverName, tool.name, params)
  → Return MCPTool[]
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
              │ (automatic)
         ┌────▼─────┐  _pause()   ┌────────┐
         │ Running  │ ──────────► │ Paused │
         └────┬─────┘ ◄────────── └────────┘
              │         _resume()
    ┌─────────┼──────────────┐
    │_terminate()            │ _crash(err)
    ▼                        ▼
┌────────────┐         ┌─────────┐
│ Terminated │         │ Crashed │
└────────────┘         └─────────┘
```

Terminal states: `terminated` and `crashed`. No restart from either — spawn a new process. Checkpointing (v0.3.0) will enable crash recovery.

See [RFC-001](../rfcs/RFC-001-PROCESS-STATE-MACHINE.md) for the full state machine specification.

## Memory Architecture

```
                    MemoryBus
          ┌─────────────────────────────┐
          │                             │
  proc-a  │  namespace: "proc-a"        │  ← isolated, deleted on terminate
          │  { key → MemoryEntry }      │
          │                             │
  proc-b  │  namespace: "proc-b"        │  ← isolated, deleted on terminate
          │  { key → MemoryEntry }      │
          │                             │
  anyone  │  namespace: "__shared__"    │  ← cross-process, kernel lifetime
          │  { key → MemoryEntry }      │
          └─────────────────────────────┘
```

Reserved keys (set by AgentVM internals, prefixed `__`):
- `__tool_schemas` — injected at spawn, consumed by `createLLMAgent()`
- `__llm_messages` — conversation history for multi-turn LLM agents
- `__llm_usage` — cumulative `{ inputTokens, outputTokens }` per process

See [RFC-002](../rfcs/RFC-002-MEMORY-BUS-INTERFACE.md) for the full memory contract.

## Event System

Every operation emits a `KernelEvent`:

```typescript
interface KernelEvent {
  id: string;        // "evt-<timestamp>-<random>"
  type: string;      // e.g. 'process:spawned', 'tool:invoked'
  source: string;    // kernel name
  timestamp: Date;
  data?: unknown;    // event-specific payload
}
```

Subscribe with `kernel.on(type, handler)` or `kernel.onAny(handler)`. Handler errors are swallowed — a broken logger cannot crash the kernel.

See [RFC-003](../rfcs/RFC-003-EVENT-SCHEMA.md) for the full event catalog and payload shapes.

## Source Layout

```
src/
  core/
    kernel.ts       ← Kernel: orchestrator, spawn, execute, events
    agent.ts        ← Agent: definition, name validation
    process.ts      ← Process: state machine, AbortController, metadata
    types.ts        ← All shared interfaces and enums
  memory/
    bus.ts          ← MemoryBus + MemoryStore (in-memory backend)
  tools/
    router.ts       ← ToolRouter: registry, invoke, rate limiting, errors
  broker/
    broker.ts       ← MessageBroker + Channel: pub/sub, direct, history
  scheduler/
    scheduler.ts    ← Scheduler: strategies, dependency layers, retry
  llm/
    agent.ts        ← createLLMAgent(), createPipeline(), Anthropic+OpenAI adapters
  mcp/
    client.ts       ← MCPClient: stdio/SSE transports, JSON-RPC, tool bridge
  builtins/
    tools.ts        ← http_fetch, json_fetch, shell_exec, file_read, file_write, wait
  cli/
    index.ts        ← CLI entry point (commander)
    commands/       ← init, start, spawn, ps, kill, logs
  index.ts          ← Public API surface
```
