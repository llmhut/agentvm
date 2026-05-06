# Getting Started

Install AgentVM and run your first agent in 5 minutes.

## Installation

```bash
npm install @llmhut/agentvm
```

**Requirements:** Node.js 20+

## Your First Agent

```typescript
import { Kernel, Agent } from '@llmhut/agentvm';

// 1. Create a kernel
const kernel = new Kernel({ name: 'my-app' });

// 2. Define an agent
const greeter = new Agent({
  name: 'greeter',
  handler: async (ctx) => {
    return `Hello, ${ctx.input}!`;
  },
});

// 3. Register, spawn, execute
kernel.register(greeter);
const proc = await kernel.spawn('greeter');
const result = await kernel.execute(proc.id, { task: 'World' });

console.log(result.output); // "Hello, World!"
console.log(result.duration); // 2 (ms)
```

That's a complete AgentVM program. Let's break down what happened:

1. **Kernel** — Created the runtime that manages everything
2. **Agent** — Defined a blueprint with a `handler` function
3. **spawn** — Created a running process from the agent blueprint
4. **execute** — Sent a task to the process and got a result

## Adding Memory

Agents can remember things between executions:

```typescript
const counter = new Agent({
  name: 'counter',
  handler: async (ctx) => {
    const count = ((await ctx.memory.get('count')) as number ?? 0) + 1;
    await ctx.memory.set('count', count);
    return `Count: ${count}`;
  },
});

kernel.register(counter);
const proc = await kernel.spawn('counter');

await kernel.execute(proc.id, { task: 'inc' }); // "Count: 1"
await kernel.execute(proc.id, { task: 'inc' }); // "Count: 2"
await kernel.execute(proc.id, { task: 'inc' }); // "Count: 3"
```

Memory is isolated per process by default. Want it to survive restarts? Use SQLite:

```typescript
import { Kernel, SqliteBackend } from '@llmhut/agentvm';

const backend = await SqliteBackend.create('./data.db');
const kernel = new Kernel({ memoryBackend: backend });
```

## Adding Tools

Register tools that agents can call:

```typescript
import { Kernel, Agent, registerBuiltins } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel); // adds http_fetch, shell_exec, file_read, etc.

const fetcher = new Agent({
  name: 'fetcher',
  tools: ['http_fetch'], // only allow this tool
  handler: async (ctx) => {
    const result = await ctx.useTool('http_fetch', {
      url: ctx.input as string,
    });
    return result;
  },
});

kernel.register(fetcher);
const proc = await kernel.spawn('fetcher');
const result = await kernel.execute(proc.id, {
  task: 'https://httpbin.org/json',
});
```

## LLM-Powered Agents

Connect to Anthropic or OpenAI with automatic tool loops:

```typescript
import { Kernel, registerBuiltins, createLLMAgent } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

const agent = createLLMAgent({
  name: 'researcher',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a research assistant. Use http_fetch to find information.',
  tools: ['http_fetch'],
});

kernel.register(agent);
const proc = await kernel.spawn('researcher');
const result = await kernel.execute(proc.id, {
  task: 'What is the current Node.js LTS version?',
});

console.log(result.output);
console.log(`Tokens used: ${result.tokensUsed}`);
```

::: tip
Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as environment variables.
:::

## Multi-Agent Pipeline

Chain agents where each one's output feeds the next:

```typescript
import { Kernel, createLLMAgent, createPipeline } from '@llmhut/agentvm';

const kernel = new Kernel();

const researcher = createLLMAgent({
  name: 'researcher',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'Research the given topic. Output a structured brief.',
  tools: ['http_fetch'],
});

const writer = createLLMAgent({
  name: 'writer',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'Turn the research brief into a 500-word article.',
});

const pipeline = await createPipeline(kernel, [researcher, writer]);
const article = await pipeline('AI agents in 2026');
```

## What's Next?

- [Core Concepts](/guide/core-concepts) — Understand the architecture
- [Tools](/guide/tools) — Register custom tools, permissions, rate limiting
- [Memory](/guide/memory) — SQLite persistence, shared memory, backends
- [LLM Agents](/guide/llm-agents) — Full guide to createLLMAgent
- [Integrations](/integrations/overview) — LangChain, Vercel AI SDK, OpenAI, Anthropic
