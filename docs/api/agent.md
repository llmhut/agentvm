# Agent

Agent blueprint defining capabilities and handler.

## Constructor

```typescript
const agent = new Agent({
  name: 'worker',
  description: 'Processes tasks',
  tools: ['http_fetch'],
  memory: { persistent: true },
  contract: { input: { type: 'string' }, output: { type: 'string' } },
  handler: async (ctx) => `Result: ${ctx.input}`,
});
```

## AgentConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Unique agent name |
| `description` | `string` | | Human-readable description |
| `tools` | `string[]` | | Allowed tool names |
| `memory` | `MemoryConfig` | | Memory settings |
| `contract` | `AgentContract` | | Input/output validation + SLA |
| `handler` | `AgentHandler` | | The execution function |
