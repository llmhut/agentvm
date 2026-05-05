# Using AgentVM with Any Framework

AgentVM provides generic adapters that work with any AI framework, API, or custom runtime. These produce standard JSON objects matching each provider's tool format.

---

## OpenAI Function Calling

```typescript
import { Kernel, registerBuiltins, toOpenAITools, createToolExecutor } from '@llmhut/agentvm';
import OpenAI from 'openai';

const kernel = new Kernel();
registerBuiltins(kernel);

const client = new OpenAI();
const executor = createToolExecutor(kernel);

// 1. Get tools in OpenAI format
const tools = toOpenAITools(kernel, ['http_fetch', 'json_fetch']);

// 2. Call OpenAI with tools
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Fetch https://httpbin.org/json' }],
  tools,
});

// 3. Execute tool calls
const choice = response.choices[0];
if (choice.message.tool_calls) {
  for (const call of choice.message.tool_calls) {
    const result = await executor(
      call.function.name,
      JSON.parse(call.function.arguments)
    );
    console.log(`${call.function.name} →`, result);
  }
}
```

---

## Anthropic Tool Use

```typescript
import { Kernel, registerBuiltins, toAnthropicTools, createToolExecutor } from '@llmhut/agentvm';
import Anthropic from '@anthropic-ai/sdk';

const kernel = new Kernel();
registerBuiltins(kernel);

const client = new Anthropic();
const executor = createToolExecutor(kernel);

const tools = toAnthropicTools(kernel, ['http_fetch']);

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Fetch https://example.com' }],
  tools,
});

for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await executor(block.name, block.input as Record<string, unknown>);
    console.log(`${block.name} →`, result);
  }
}
```

---

## Expose as MCP Server

Turn your AgentVM kernel into an MCP server that Claude Desktop, Cursor, Windsurf, or any MCP client can connect to:

```typescript
import { Kernel, registerBuiltins, serveMCP } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

// Add your custom tools
kernel.registerTool({
  name: 'query_database',
  description: 'Run a SQL query against the app database',
  parameters: {
    type: 'object',
    properties: { sql: { type: 'string' } },
    required: ['sql'],
  },
  sideEffects: 'read',
  permission: 'restricted',
  handler: async (params) => {
    const { sql } = params as { sql: string };
    // your database query here
    return { rows: [], sql };
  },
});

// Start MCP server on stdio
await serveMCP(kernel);
```

Then configure your MCP client to connect:

```json
{
  "mcpServers": {
    "agentvm": {
      "command": "npx",
      "args": ["tsx", "my-mcp-server.ts"]
    }
  }
}
```

---

## Tool Executor

`createToolExecutor()` gives you a simple function for running tool calls from any model response:

```typescript
import { Kernel, registerBuiltins, createToolExecutor } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

const executor = createToolExecutor(kernel);

// Execute any registered tool by name
const result = await executor('http_fetch', { url: 'https://example.com' });
const shellResult = await executor('shell_exec', { command: 'ls -la' });

// Works with MCP tools too
// await executor('mcp:filesystem:read_file', { path: '/tmp/test.txt' });
```

---

## Debug: Describe Tools

```typescript
import { Kernel, registerBuiltins, describeTools } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

console.log(describeTools(kernel));
// http_fetch(url, method, headers, body, timeout) — Fetch a URL and return its content. [public, read]
// json_fetch(url, method, headers, body) — Fetch a URL and parse the response as JSON. [public, read]
// shell_exec(command, cwd, timeout) — Execute a shell command and return its output. [admin, execute]
// file_read(path, encoding, maxSize) — Read the contents of a file. [restricted, read]
// file_write(path, content, append) — Write content to a file. [admin, write]
// wait(ms) — Wait for a specified number of milliseconds. [public, none]
```

---

## API Reference

| Function | Returns | Use Case |
|---|---|---|
| `toOpenAITools(kernel, filter?)` | `OpenAIToolShape[]` | OpenAI, LiteLLM, Ollama |
| `toAnthropicTools(kernel, filter?)` | `AnthropicToolShape[]` | Anthropic Claude API |
| `createToolExecutor(kernel, context?)` | `(name, args) => result` | Execute tools from any response |
| `serveMCP(kernel)` | `void` | Expose tools as MCP server |
| `describeTools(kernel)` | `string` | Human-readable tool listing |
