# MCP Server

Expose your AgentVM tools as an MCP server that Claude Desktop, Cursor, Windsurf, or any MCP client can connect to.

## Setup

```typescript
// mcp-server.ts
import { Kernel, registerBuiltins, serveMCP } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

// Add your own tools
kernel.registerTool({
  name: 'query_db',
  description: 'Query the database',
  parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  sideEffects: 'read',
  permission: 'restricted',
  handler: async (params) => { /* your query */ },
});

await serveMCP(kernel);
```

## Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "npx",
      "args": ["tsx", "mcp-server.ts"]
    }
  }
}
```

Now Claude can use `http_fetch`, `file_read`, `query_db`, and any other tool you registered.

## What Gets Exposed

Every tool in `kernel.tools.tools` is exposed with its name, description, and parameter schema. AgentVM's rate limiting and permission checks still apply.
