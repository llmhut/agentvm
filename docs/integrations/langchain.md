# Using AgentVM with LangChain.js

AgentVM integrates with LangChain.js as both a **tool provider** and a **memory backend**. This means you can use AgentVM's tool router (with rate limiting, permissions, and MCP tools) inside any LangChain agent, and persist LangChain conversation history via AgentVM's pluggable memory (SQLite, etc).

No changes to LangChain are needed — AgentVM produces plain objects that conform to LangChain's interfaces.

---

## Installation

```bash
npm install @llmhut/agentvm langchain @langchain/core @langchain/openai
```

---

## Quick Start — Tools

Convert AgentVM tools into LangChain `DynamicStructuredTool` format:

```typescript
import { Kernel, registerBuiltins, toLangChainTools } from '@llmhut/agentvm';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// 1. Set up AgentVM kernel with tools
const kernel = new Kernel();
registerBuiltins(kernel); // http_fetch, shell_exec, file_read, etc.

// 2. Convert to LangChain format
const toolShapes = toLangChainTools(kernel, ['http_fetch', 'json_fetch']);

// 3. Wrap in DynamicStructuredTool (LangChain needs Zod schemas)
const langchainTools = toolShapes.map(shape =>
  new DynamicStructuredTool({
    name: shape.name,
    description: shape.description,
    schema: z.object({}).passthrough(), // accept any input
    func: shape.func,
  })
);

// 4. Use in any LangChain agent
// const agent = await createOpenAIToolsAgent({ llm, tools: langchainTools, prompt });
```

### Converting a single tool

```typescript
import { toolToLangChain } from '@llmhut/agentvm';

const kernel = new Kernel();
kernel.registerTool({
  name: 'weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  sideEffects: 'read',
  permission: 'public',
  rateLimit: 30,
  handler: async (params) => {
    const { city } = params as { city: string };
    // your weather API call here
    return { temp: 72, condition: 'sunny', city };
  },
});

const tool = kernel.tools.getTool('weather')!;
const lcTool = toolToLangChain(tool);

// lcTool.name === 'weather'
// lcTool.description === 'Get current weather for a city'
// lcTool.schema === { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
// lcTool.func({ city: 'London' }) => '{"temp":72,"condition":"sunny","city":"London"}'
```

### Filtering tools

```typescript
// Only expose specific tools to LangChain
const safeTools = toLangChainTools(kernel, ['http_fetch', 'json_fetch']);
// Excludes shell_exec, file_write, etc.
```

---

## Quick Start — Memory

Use AgentVM's pluggable memory (including SQLite persistence) as LangChain conversation memory:

```typescript
import { Kernel, SqliteBackend, toLangChainMemory } from '@llmhut/agentvm';

// 1. Create kernel with SQLite backend
const backend = await SqliteBackend.create('./chat-memory.db');
const kernel = new Kernel({ memoryBackend: backend });

// 2. Create LangChain-compatible memory
const memory = toLangChainMemory(kernel, 'user-session-123', {
  memoryKey: 'chat_history',  // variable name in your prompt
  maxEntries: 50,              // keep last 50 exchanges
  returnFormat: 'string',     // 'string' or 'array'
});

// 3. Use in a LangChain chain
// const chain = new ConversationChain({ llm, memory });

// Manual usage:
await memory.saveContext(
  { input: 'What is AgentVM?' },
  { output: 'AgentVM is a runtime for AI agents.' }
);

const vars = await memory.loadMemoryVariables({});
console.log(vars.chat_history);
// "Human: What is AgentVM?\nAI: AgentVM is a runtime for AI agents."

// Clear history
await memory.clear();
```

### Why use AgentVM memory over LangChain's built-in?

| LangChain built-in memory | AgentVM memory |
|---|---|
| In-memory only (default) | SQLite, with Redis planned |
| Lost on restart | Persists across restarts |
| Per-chain scoping | Namespace-based, shared across chains |
| No stats/monitoring | `Kernel.stats()` tracks all namespaces |
| No checkpointing | `checkpoint()` / `restore()` for full state save |

---

## Full Example — LangChain Agent with AgentVM Tools + Memory

```typescript
import { Kernel, registerBuiltins, toLangChainTools, toLangChainMemory, SqliteBackend } from '@llmhut/agentvm';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { z } from 'zod';

async function main() {
  // ── AgentVM Setup ──
  const backend = await SqliteBackend.create('./agent-memory.db');
  const kernel = new Kernel({ memoryBackend: backend });
  registerBuiltins(kernel);

  // ── Tools ──
  const toolShapes = toLangChainTools(kernel, ['http_fetch', 'json_fetch']);
  const tools = toolShapes.map(shape =>
    new DynamicStructuredTool({
      name: shape.name,
      description: shape.description,
      schema: z.object({}).passthrough(),
      func: shape.func,
    })
  );

  // ── Memory ──
  const memory = toLangChainMemory(kernel, 'main-session', {
    memoryKey: 'chat_history',
    maxEntries: 20,
  });

  // ── LangChain Agent ──
  const llm = new ChatOpenAI({ model: 'gpt-4o' });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant. Use tools when needed.'],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
  const executor = new AgentExecutor({ agent, tools });

  // ── Run ──
  const result = await executor.invoke({ input: 'Fetch https://httpbin.org/json and summarize it' });
  console.log(result.output);

  // Save to AgentVM memory
  await memory.saveContext({ input: 'Fetch httpbin' }, { output: result.output });

  // Later: memory persists in SQLite
  const history = await memory.loadMemoryVariables({});
  console.log('History:', history.chat_history);

  await backend.close();
}

main().catch(console.error);
```

---

## Using MCP Tools in LangChain

AgentVM can connect to MCP servers and expose their tools to LangChain:

```typescript
import { Kernel, MCPClient, toLangChainTools } from '@llmhut/agentvm';

const kernel = new Kernel();
const mcp = new MCPClient(kernel);

// Connect to an MCP server — tools auto-register
await mcp.connect({
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
});

// All MCP tools are now available as LangChain tools
const tools = toLangChainTools(kernel);
// tools includes: mcp:filesystem:read_file, mcp:filesystem:write_file, etc.
```

---

## API Reference

### `toLangChainTools(kernel, filter?)`

Convert AgentVM tools to LangChain-compatible tool shapes.

| Parameter | Type | Description |
|---|---|---|
| `kernel` | `Kernel` | The AgentVM kernel with registered tools |
| `filter` | `string[]` | Optional list of tool names to include |

Returns `LangChainToolShape[]` — each with `name`, `description`, `schema`, `func`.

### `toolToLangChain(tool, context?)`

Convert a single `ToolDefinition` to LangChain shape.

### `toLangChainMemory(kernel, namespace, options?)`

Create a LangChain-compatible memory object.

| Option | Type | Default | Description |
|---|---|---|---|
| `memoryKey` | `string` | `'chat_history'` | Variable name for the prompt |
| `maxEntries` | `number` | unlimited | Max conversation turns to keep |
| `returnFormat` | `'string' \| 'array'` | `'string'` | How history is formatted |

Returns `LangChainMemoryShape` with `memoryVariables`, `loadMemoryVariables()`, `saveContext()`, `clear()`.

---

## Contributing to LangChain

If you'd like to see AgentVM as an official LangChain integration, you can help by:

1. **Opening a PR** to [`langchain-ai/langchainjs`](https://github.com/langchain-ai/langchainjs) adding AgentVM as a toolkit in `@langchain/community`
2. **Publishing a standalone package** `@langchain/agentvm` following their [integration guidelines](https://github.com/langchain-ai/langchainjs/blob/main/.github/contributing/INTEGRATIONS.md)
3. **Posting on the [LangChain Forum](https://forum.langchain.com/)** to gauge community interest

The adapter code in `src/adapters/langchain.ts` is the foundation — it just needs to be wrapped in LangChain's class hierarchy (`BaseToolkit`, `BaseChatMemory`).
