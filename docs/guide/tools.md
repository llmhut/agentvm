# Tools

## Built-in Tools

AgentVM ships with 6 tools ready to use:

```typescript
import { Kernel, registerBuiltins } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);
// Registers: http_fetch, json_fetch, shell_exec, file_read, file_write, wait
```

| Tool | Permission | Side Effects | Description |
|------|-----------|-------------|-------------|
| `http_fetch` | public | read | Fetch any URL, returns status + body |
| `json_fetch` | public | read | Fetch URL, parse response as JSON |
| `shell_exec` | admin | execute | Run shell commands |
| `file_read` | restricted | read | Read file contents |
| `file_write` | admin | write | Write/append to files |
| `wait` | public | none | Sleep for N milliseconds |

## Custom Tools

```typescript
kernel.registerTool({
  name: 'search_database',
  description: 'Search the product database',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results' },
    },
    required: ['query'],
  },
  sideEffects: 'read',
  permission: 'restricted',
  rateLimit: 30, // max 30 calls per minute
  handler: async (params, context) => {
    const { query, limit } = params as { query: string; limit?: number };
    // your database query here
    return { results: [], query, limit: limit ?? 10 };
  },
});
```

## Permissions

Tools have three permission levels:

- **`public`** — Any agent can use it
- **`restricted`** — Agent must declare it in `tools: [...]`
- **`admin`** — Agent must declare it and have admin access

## Rate Limiting

```typescript
kernel.registerTool({
  name: 'api_call',
  rateLimit: 10, // max 10 calls per minute per agent
  // ...
});
```

Rate limits are scoped per agent, not global.

## Agent Tool Allowlists

Agents only get access to tools they declare:

```typescript
const agent = new Agent({
  name: 'reader',
  tools: ['http_fetch', 'file_read'], // can only use these two
  handler: async (ctx) => {
    await ctx.useTool('http_fetch', { url: '...' });    // ✅ works
    await ctx.useTool('shell_exec', { command: 'ls' }); // ❌ throws
  },
});
```

## Using in Agents

```typescript
handler: async (ctx) => {
  const result = await ctx.useTool('http_fetch', {
    url: 'https://api.example.com/data',
    method: 'GET',
  });
  return result;
}
```

## Using with Other Frameworks

Export tools in any format:

```typescript
import { toOpenAITools, toAnthropicTools, toAISDKTools, toLangChainTools } from '@llmhut/agentvm';

const openai = toOpenAITools(kernel);        // OpenAI function calling
const anthropic = toAnthropicTools(kernel);  // Anthropic tool use
const aiSdk = toAISDKTools(kernel);          // Vercel AI SDK
const langchain = toLangChainTools(kernel);  // LangChain
```

See [Integrations](/integrations/overview) for detailed guides.
