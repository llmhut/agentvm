# Core Concepts

AgentVM has five building blocks. Understanding how they fit together is the key to using it well.

## Kernel

The **Kernel** is the central orchestrator. Everything goes through it.

```typescript
const kernel = new Kernel({ name: 'my-app' });
```

The kernel manages the agent registry, process table, memory bus, tool router, message broker, and scheduler. It's the single object you pass around.

## Agent

An **Agent** is a blueprint — a definition of what something can do. It's not running yet.

```typescript
const agent = new Agent({
  name: 'analyzer',
  description: 'Analyzes data and produces reports',
  tools: ['http_fetch', 'file_read'],    // tools it can access
  memory: { persistent: true },           // memory config
  contract: {                             // input/output types
    input: { type: 'string' },
    output: { type: 'object' },
  },
  handler: async (ctx) => {               // what it actually does
    // ...
    return { analysis: 'done' };
  },
});
```

Think of an Agent like a class definition, not an instance.

## Process

A **Process** is a running instance of an agent. You can have multiple processes from the same agent.

```typescript
kernel.register(agent);

const proc1 = await kernel.spawn('analyzer');
const proc2 = await kernel.spawn('analyzer'); // separate instance

// Each has its own memory, its own lifecycle
await kernel.execute(proc1.id, { task: 'analyze sales' });
await kernel.execute(proc2.id, { task: 'analyze inventory' });
```

Processes have a lifecycle:

```
created → starting → running → paused → terminated
                        ↓
                     crashed
```

You can pause, resume, and terminate processes:

```typescript
await kernel.pause(proc.id);
await kernel.resume(proc.id);
await kernel.terminate(proc.id);
```

## ExecutionContext

When a process runs, its handler receives an **ExecutionContext** — the agent's window into the world:

```typescript
handler: async (ctx) => {
  ctx.processId;           // this process's ID
  ctx.agentName;           // agent name
  ctx.input;               // the task input
  ctx.memory.get('key');   // read from memory
  ctx.memory.set('k', v); // write to memory
  ctx.useTool('name', {}); // call a tool
  ctx.publish('channel', data); // publish a message
  ctx.emit('event', data);      // emit an event
  ctx.signal;              // AbortSignal for cancellation
}
```

Everything an agent needs is in the context. No global state, no singletons.

## ExecutionResult

Every `kernel.execute()` returns a result:

```typescript
const result = await kernel.execute(proc.id, { task: 'work' });

result.processId;   // process that ran
result.agentName;   // agent name
result.output;      // whatever the handler returned
result.duration;    // wall-clock milliseconds
result.tokensUsed;  // LLM tokens (if applicable)
result.events;      // structured events emitted during execution
```

## How They Fit Together

```
            register()              spawn()              execute()
Agent ──────────────→ Kernel ────────────→ Process ────────────→ Result
                        │                     │
                        ├── MemoryBus         ├── ExecutionContext
                        ├── ToolRouter        │     ├── memory
                        ├── MessageBroker     │     ├── useTool
                        └── Scheduler         │     ├── publish
                                              │     └── emit
                                              │
                                         handler(ctx)
                                              │
                                              ↓
                                         return output
```

## Next Steps

- [Agents & Processes](/guide/agents) — Lifecycle management, metadata, events
- [Tools](/guide/tools) — Register, permission, rate limit
- [Memory](/guide/memory) — Backends, persistence, shared state
