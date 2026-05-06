# Architecture

For the full architecture document, see [Architecture Overview](https://github.com/llmhut/agentvm/blob/main/docs/architecture/OVERVIEW.md).

## Design Principles

1. **Modular** — Every component is independent and replaceable
2. **Event-driven** — All operations emit structured events
3. **Framework-agnostic** — No opinions about LLMs or agent frameworks
4. **Async-first** — All I/O is non-blocking
5. **Type-safe** — Full TypeScript with strict mode

## Component Map

```
Kernel (orchestrator)
├── Process Manager — spawn, pause, resume, terminate
├── MemoryBus — pluggable backends (InMemory, SQLite)
├── ToolRouter — registry, permissions, rate limits
├── MessageBroker — pub/sub, direct, priority queues
├── Scheduler — sequential, parallel, race, conditional
├── LLM Agent — Anthropic + OpenAI with tool loops
├── MCP Client — stdio + SSE transport
├── Contracts — runtime input/output validation
├── Checkpointing — serialize/restore process state
└── Config — YAML config loader
```

## Data Flow

```
kernel.execute(processId, { task: 'work' })
  │
  ├── validate input (contract)
  ├── build ExecutionContext (memory, tools, messaging)
  ├── call handler(ctx)
  │     ├── ctx.memory.get/set (→ MemoryBus → Backend)
  │     ├── ctx.useTool (→ ToolRouter → handler)
  │     ├── ctx.publish (→ MessageBroker → subscribers)
  │     └── return output
  ├── validate output (contract)
  ├── check SLA (latency)
  ├── read __llm_usage (token tracking)
  └── return ExecutionResult
```
