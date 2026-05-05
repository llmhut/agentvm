# Using AgentVM with Vercel AI SDK

AgentVM tools plug directly into the Vercel AI SDK's `generateText()` and `streamText()` functions. This gives you AgentVM's tool router (rate limiting, permissions, MCP tools) inside any AI SDK app.

---

## Installation

```bash
npm install @llmhut/agentvm ai @ai-sdk/openai
```

---

## Quick Start

```typescript
import { Kernel, registerBuiltins, toAISDKTools } from '@llmhut/agentvm';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const kernel = new Kernel();
registerBuiltins(kernel);

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Fetch https://httpbin.org/json and tell me what it contains',
  tools: toAISDKTools(kernel, ['http_fetch']),
});

console.log(result.text);
```

That's it — `toAISDKTools()` returns a `Record<string, tool>` that the AI SDK accepts directly.

---

## Streaming

```typescript
import { streamText } from 'ai';

const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'Read /tmp/notes.txt and summarize it',
  tools: toAISDKTools(kernel, ['file_read']),
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

---

## Token Usage Tracking

Track token usage from AI SDK calls in AgentVM's memory system:

```typescript
import { Kernel, createUsageTracker } from '@llmhut/agentvm';
import { generateText } from 'ai';

const kernel = new Kernel();
const tracker = createUsageTracker(kernel, 'my-session');

const result = await generateText({ model, prompt, tools });

// Record usage into AgentVM memory
await tracker.record(result.usage);

// Check totals (aggregated across all calls)
const total = await tracker.getTotal();
console.log(`Total tokens: ${total.totalTokens}`);

// Shows up in kernel.stats() too
const stats = await kernel.stats();
console.log(`All sessions: ${stats.tokens} tokens`);

// Reset for a new billing period
await tracker.reset();
```

---

## Using MCP Tools

```typescript
import { Kernel, MCPClient, toAISDKTools } from '@llmhut/agentvm';
import { generateText } from 'ai';

const kernel = new Kernel();
const mcp = new MCPClient(kernel);

await mcp.connect({
  name: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
});

// MCP tools are now available as AI SDK tools
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'List my open GitHub issues',
  tools: toAISDKTools(kernel),
});
```

---

## Filtering Tools

```typescript
// Only expose safe tools
const readOnlyTools = toAISDKTools(kernel, ['http_fetch', 'json_fetch', 'file_read']);
// Excludes shell_exec, file_write, etc.
```

---

## With SQLite Persistence

```typescript
import { Kernel, SqliteBackend, registerBuiltins, toAISDKTools, createUsageTracker } from '@llmhut/agentvm';

const backend = await SqliteBackend.create('./ai-app.db');
const kernel = new Kernel({ memoryBackend: backend });
registerBuiltins(kernel);

const tracker = createUsageTracker(kernel, 'user-123');

// ... use tools, track usage ...

// Everything persists to SQLite
await backend.close();
```

---

## API Reference

### `toAISDKTools(kernel, filter?)`

Returns `Record<string, AISDKToolShape>` — pass directly to `generateText({ tools })`.

### `toolToAISDK(tool, context?)`

Convert a single `ToolDefinition` to AI SDK format.

### `createUsageTracker(kernel, namespace)`

Returns `{ record(usage), getTotal(), reset() }` for token tracking.
