# Checkpointing

Save and restore process state — including all memory — to/from disk.

## Save a Checkpoint

```typescript
import { checkpoint } from '@llmhut/agentvm';

await checkpoint(kernel, proc.id, './checkpoints/proc-1.json');
```

## Restore from Checkpoint

```typescript
import { restore } from '@llmhut/agentvm';

const restored = await restore(kernel, './checkpoints/proc-1.json');
// Process is running, memory is restored
const result = await kernel.execute(restored.id, { task: 'continue' });
```

## Inspect Without Restoring

```typescript
import { readCheckpoint } from '@llmhut/agentvm';

const data = await readCheckpoint('./checkpoints/proc-1.json');
console.log(data.agentName, data.memory);
```

## Checkpoint Format

JSON file containing:

```json
{
  "version": 1,
  "createdAt": "2026-05-05T10:30:00.000Z",
  "processId": "worker-1-abc123",
  "agentName": "worker",
  "metadata": { "priority": "high" },
  "memory": {
    "count": 42,
    "__llm_messages": [...]
  }
}
```
