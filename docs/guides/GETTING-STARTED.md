# Getting Started with AgentKernel

This guide will have you running agents in under 5 minutes.

## Installation

```bash
npm install agentkernel
```

**Requirements:** Node.js 20+

## Core Concepts

**Agent** — A definition/blueprint. Declares what an agent can do.

**Process** — A running instance of an agent. Has a lifecycle (created → running → terminated).

**Kernel** — The runtime that manages agents and processes.

Think of it like this: an `Agent` is a class, a `Process` is an instance, and the `Kernel` is the runtime that manages them.

## Step 1: Create a Kernel

```typescript
import { Kernel } from 'agentkernel';

const kernel = new Kernel({
  name: 'my-app',
  debug: true,  // Logs all events to console
});
```

## Step 2: Define an Agent

```typescript
import { Agent } from 'agentkernel';

const researcher = new Agent({
  name: 'researcher',
  description: 'Researches topics and returns findings',
  tools: ['web_search'],
});
```

## Step 3: Register and Spawn

```typescript
// Register the agent definition
kernel.register(researcher);

// Spawn a running process
const process = await kernel.spawn('researcher');
console.log(process.state); // 'running'
console.log(process.id);    // 'researcher-1-m1abc2'
```

## Step 4: Manage the Lifecycle

```typescript
// Pause
await kernel.pause(process.id);
console.log(process.state); // 'paused'

// Resume
await kernel.resume(process.id);
console.log(process.state); // 'running'

// Terminate
await kernel.terminate(process.id);
console.log(process.state); // 'terminated'
```

## Step 5: Listen to Events

```typescript
const kernel = new Kernel();

// Listen to specific events
kernel.on('process:spawned', (event) => {
  console.log(`New process: ${event.data.id}`);
});

// Listen to ALL events
kernel.onAny((event) => {
  console.log(`[${event.type}]`, event.data);
});
```

## Step 6: Use Memory

```typescript
import { MemoryBus } from 'agentkernel';

const memoryBus = new MemoryBus();

// Per-process isolated memory
const mem = memoryBus.getAccessor(process.id);
await mem.set('findings', ['result 1', 'result 2']);
await mem.get('findings'); // ['result 1', 'result 2']

// Cross-agent shared memory
const shared = memoryBus.getSharedAccessor();
await shared.set('config', { model: 'claude-sonnet' });
```

## Step 7: Register Tools

```typescript
import { ToolRouter } from 'agentkernel';

const toolRouter = new ToolRouter();

toolRouter.register({
  name: 'web_search',
  description: 'Search the web',
  parameters: { type: 'object' },
  sideEffects: 'read',
  permission: 'public',
  rateLimit: 10, // 10 calls per minute
  handler: async (params) => {
    // Your implementation here
    return { results: ['...'] };
  },
});
```

## Step 8: Agent Communication

```typescript
import { MessageBroker } from 'agentkernel';

const broker = new MessageBroker();

// Create a channel
broker.createChannel({ name: 'findings', type: 'pubsub' });

// Subscribe
broker.subscribe('findings', 'analyst-proc-1', (message) => {
  console.log(`Got findings from ${message.from}:`, message.data);
});

// Publish
broker.publish('findings', 'researcher-proc-1', {
  topic: 'AI Agents',
  results: ['...'],
});
```

## What's Next?

- Check out the [examples/](../examples/) directory for more patterns
- Read the [Architecture Overview](../docs/architecture/OVERVIEW.md)
- See the [Roadmap](../ROADMAP.md) for what's coming next
- Join our Discord to connect with the community
