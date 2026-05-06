# Process

A running instance of an agent with its own lifecycle and memory.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique process ID |
| `agentName` | `string` | Parent agent name |
| `state` | `ProcessState` | Current state |
| `info` | `ProcessInfo` | Full info including metadata |

## ProcessState

`created` → `starting` → `running` → `paused` → `terminated` / `crashed`

## Spawn Options

```typescript
await kernel.spawn('agent', {
  id: 'custom-id',
  metadata: { owner: 'user-1' },
  timeout: 30000,
  tokenBudget: 10000,
});
```
