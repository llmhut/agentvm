# Getting Started with AgentVM

This guide will have you running agents in under 5 minutes.

## Installation

```bash
npm install @llmhut/agentvm
```

**Requirements:** Node.js 20+

## Core Concepts

**Agent** — A definition/blueprint. Declares what an agent can do and provides a `handler` function.

**Process** — A running instance of an agent. Has a lifecycle (`created → running → terminated`).

**Kernel** — The runtime that manages agents, processes, memory, tools, and messaging.

Think of it like this: an `Agent` is a class, a `Process` is an instance, and the `Kernel` is the OS that manages them.

---

## Step 1: Your first agent

```typescript
import { Kernel, Agent } from '@llmhut/agentvm';

const kernel = new Kernel({ name: 'my-app' });

const echo = new Agent({
  name: 'echo',
  description: 'Echoes its input back',
  handler: async (ctx) => {
    return `You said: ${ctx.input}`;
  },
});

kernel.register(echo);
const proc = await kernel.spawn('echo');
const result = await kernel.execute(proc.id, { task: 'hello world' });

console.log(result.output); // "You said: hello world"
await kernel.terminate(proc.id);
```

---

## Step 2: Using memory

Agents get isolated working memory per process. Memory persists across multiple `execute()` calls on the same process.

```typescript
const counter = new Agent({
  name: 'counter',
  handler: async (ctx) => {
    const n = ((await ctx.memory.get('count')) as number ?? 0) + 1;
    await ctx.memory.set('count', n);
    return n;
  },
});

kernel.register(counter);
const proc = await kernel.spawn('counter');

console.log((await kernel.execute(proc.id, { task: 'inc' })).output); // 1
console.log((await kernel.execute(proc.id, { task: 'inc' })).output); // 2
console.log((await kernel.execute(proc.id, { task: 'inc' })).output); // 3
```

For cross-agent shared state, use `kernel.memory.getSharedAccessor()`.

---

## Step 3: Registering and using tools

```typescript
import { Kernel, Agent } from '@llmhut/agentvm';

const kernel = new Kernel();

kernel.registerTool({
  name: 'reverse',
  description: 'Reverses a string',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  sideEffects: 'none',
  permission: 'public',
  handler: async (params) => {
    const { text } = params as { text: string };
    return text.split('').reverse().join('');
  },
});

const agent = new Agent({
  name: 'reverser',
  tools: ['reverse'], // declare which tools this agent can use
  handler: async (ctx) => {
    return ctx.useTool('reverse', { text: ctx.input });
  },
});

kernel.register(agent);
const proc = await kernel.spawn('reverser');
const result = await kernel.execute(proc.id, { task: 'hello' });
console.log(result.output); // "olleh"
```

Or use the built-in tools that ship with AgentVM:

```typescript
import { registerBuiltins } from '@llmhut/agentvm';

registerBuiltins(kernel); // registers http_fetch, json_fetch, shell_exec, file_read, file_write, wait
```

---

## Step 4: LLM agents

Use `createLLMAgent()` to create agents powered by Anthropic or OpenAI models. The agent automatically runs a tool-use loop.

```typescript
import { Kernel } from '@llmhut/agentvm';
import { createLLMAgent } from '@llmhut/agentvm/llm'; // or '@llmhut/agentvm' (re-exported)
import { httpFetchTool } from '@llmhut/agentvm';

const kernel = new Kernel();
kernel.registerTool(httpFetchTool);

const researcher = createLLMAgent({
  name: 'researcher',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a research assistant. Use http_fetch to gather information.',
  tools: ['http_fetch'],
  maxTurns: 10,
});

kernel.register(researcher);
const proc = await kernel.spawn('researcher');

// ANTHROPIC_API_KEY must be set in your environment
const result = await kernel.execute(proc.id, {
  task: 'What is the current price of Bitcoin?',
});

console.log(result.output);
await kernel.shutdown();
```

For OpenAI, swap `provider: 'openai'` and set `OPENAI_API_KEY`.

---

## Step 5: MCP tools

Connect to any MCP server (stdio or SSE) and its tools automatically become available in the `ToolRouter`.

```typescript
import { Kernel, MCPClient } from '@llmhut/agentvm';
import { createLLMAgent } from '@llmhut/agentvm';

const kernel = new Kernel();
const mcp = new MCPClient(kernel);

// Connect to a stdio MCP server — tools auto-register as mcp:<name>:<tool>
const tools = await mcp.connect({
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
});

console.log(tools.map(t => `mcp:filesystem:${t.name}`));
// ["mcp:filesystem:read_file", "mcp:filesystem:write_file", ...]

const agent = createLLMAgent({
  name: 'file-agent',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a file management assistant.',
  tools: ['mcp:filesystem:read_file', 'mcp:filesystem:write_file'],
});

kernel.register(agent);
const proc = await kernel.spawn('file-agent');
await kernel.execute(proc.id, { task: 'Create a file at /tmp/hello.txt saying Hello World' });

await mcp.disconnectAll();
await kernel.shutdown();
```

---

## Step 6: Multi-agent pipelines

```typescript
import { Kernel } from '@llmhut/agentvm';
import { createLLMAgent, createPipeline } from '@llmhut/agentvm';

const kernel = new Kernel();

const researcher = createLLMAgent({ name: 'researcher', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'Research the given topic thoroughly.', maxTurns: 5 });
const writer = createLLMAgent({ name: 'writer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'Turn research findings into a polished article.', maxTurns: 2 });

const run = await createPipeline(kernel, [researcher, writer]);
const article = await run('The future of AI agents in 2026');
console.log(article);
```

---

## Step 7: Events and observability

Every operation emits a structured event. Subscribe to observe everything the kernel does.

```typescript
// Listen to a specific event
kernel.on('execution:completed', (event) => {
  console.log(`Done in ${event.data.duration}ms`);
});

// Listen to ALL events
kernel.onAny((event) => {
  console.log(`[${event.timestamp.toISOString()}] ${event.type}`, event.data);
});

// Or pass handlers at construction time
const kernel = new Kernel({
  debug: true, // logs all events to console.warn automatically
  on: {
    'process:crashed': (e) => alerts.send(`Process crashed: ${e.data.id}`),
  },
});
```

See [RFC-003](../rfcs/RFC-003-EVENT-SCHEMA.md) for the full event catalog and payload shapes.

---

## Step 8: Process lifecycle

```typescript
const proc = await kernel.spawn('researcher');

await kernel.pause(proc.id);
console.log(proc.state);  // 'paused'

await kernel.resume(proc.id);
console.log(proc.state);  // 'running'

await kernel.terminate(proc.id);
console.log(proc.state);  // 'terminated'

// Terminate all active processes
await kernel.shutdown();
```

---

## What's next?

- Browse the [examples/](../../examples/) directory for runnable scripts
- Read the [Architecture Overview](../architecture/OVERVIEW.md) for the full system design
- Check the [Roadmap](../../ROADMAP.md) for what's coming in v0.3.0
- See [RFC-001](../rfcs/RFC-001-PROCESS-STATE-MACHINE.md), [RFC-002](../rfcs/RFC-002-MEMORY-BUS-INTERFACE.md), [RFC-003](../rfcs/RFC-003-EVENT-SCHEMA.md) for design decisions
