# Agents & Processes

## Defining an Agent

```typescript
import { Agent } from '@llmhut/agentvm';

const agent = new Agent({
  name: 'worker',
  description: 'Processes tasks',
  tools: ['http_fetch'],              // allowed tools
  memory: { persistent: true },        // survive restarts
  contract: {                          // runtime validation
    input: { type: 'string' },
    output: { type: 'string' },
    maxLatency: 5000,                  // SLA: 5 seconds
  },
  handler: async (ctx) => {
    return `Processed: ${ctx.input}`;
  },
});
```

## Process Lifecycle

```typescript
const kernel = new Kernel();
kernel.register(agent);

// Spawn — creates a running process
const proc = await kernel.spawn('worker', {
  metadata: { priority: 'high', owner: 'user-1' },
});

// Execute — run a task
const result = await kernel.execute(proc.id, { task: 'do something' });

// Pause/Resume
await kernel.pause(proc.id);
await kernel.resume(proc.id);

// Terminate
await kernel.terminate(proc.id);
```

## Multiple Instances

You can spawn multiple processes from the same agent:

```typescript
const procs = await Promise.all([
  kernel.spawn('worker'),
  kernel.spawn('worker'),
  kernel.spawn('worker'),
]);

// Each has isolated memory and independent lifecycle
```

## Process State

```typescript
const info = proc.info;
info.id;           // "worker-1-m2abc"
info.agentName;    // "worker"
info.state;        // "running"
info.createdAt;    // Date
info.metadata;     // { priority: 'high', owner: 'user-1' }
```

## Events

The kernel emits events for all lifecycle changes:

```typescript
const kernel = new Kernel({
  on: {
    'process:spawned': (e) => console.log('Spawned:', e.data),
    'process:terminated': (e) => console.log('Terminated:', e.data),
    'execution:completed': (e) => console.log('Done:', e.data),
  },
});
```
