# MCP Integration

Connect to any MCP server and use its tools in AgentVM agents.

## Connecting to an MCP Server

```typescript
import { Kernel, MCPClient } from '@llmhut/agentvm';

const kernel = new Kernel();
const mcp = new MCPClient(kernel);

// Stdio transport (local process)
await mcp.connect({
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
});

// SSE transport (remote server)
await mcp.connect({
  name: 'weather',
  transport: 'sse',
  url: 'http://localhost:3001/sse',
});
```

Tools auto-register with the kernel as `mcp:server-name:tool-name`.

## Using MCP Tools in Agents

```typescript
const agent = new Agent({
  name: 'file-reader',
  tools: ['mcp:filesystem:read_file'],
  handler: async (ctx) => {
    return ctx.useTool('mcp:filesystem:read_file', { path: '/tmp/data.txt' });
  },
});
```

## With LLM Agents

```typescript
const agent = createLLMAgent({
  name: 'assistant',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You can read and write files.',
  tools: ['mcp:filesystem:read_file', 'mcp:filesystem:write_file'],
});
```

## Exposing AgentVM as an MCP Server

```typescript
import { Kernel, registerBuiltins, serveMCP } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);
await serveMCP(kernel);
// Claude Desktop, Cursor, etc. can now use your tools
```

## Cleanup

```typescript
await mcp.disconnect('filesystem');
// or
await mcp.disconnectAll();
```
