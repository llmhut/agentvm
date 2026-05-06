# Memory

## Basics

Every process gets isolated memory via `ctx.memory`:

```typescript
handler: async (ctx) => {
  await ctx.memory.set('key', { any: 'value' });
  const val = await ctx.memory.get('key');
  await ctx.memory.delete('key');
  const keys = await ctx.memory.list('prefix:');
  await ctx.memory.clear();
}
```

Memory is isolated per process — two processes can't see each other's data.

## Persistence with SQLite

By default, memory is in-process and lost on restart. For persistence:

```typescript
import { Kernel, SqliteBackend } from '@llmhut/agentvm';

const backend = await SqliteBackend.create('./data/agentvm.db');
const kernel = new Kernel({ memoryBackend: backend });

// Now all memory persists to SQLite
// Agents pick up where they left off after restart
```

::: tip
Call `await backend.close()` when shutting down to flush pending writes.
:::

## Backends

| Backend | Persistence | Use Case |
|---------|------------|----------|
| `InMemoryBackend` | None | Development, testing, ephemeral agents |
| `SqliteBackend` | File-based | Production single-node, zero config |

The `MemoryBackend` interface is stable — implement it to add Redis, Postgres, or any other backend.

## Shared Memory

Processes can share data via the shared accessor:

```typescript
// In one process
const shared = kernel.memory.getSharedAccessor();
await shared.set('global_config', { model: 'claude-sonnet-4-20250514' });

// In another process
const shared = kernel.memory.getSharedAccessor();
const config = await shared.get('global_config');
```

## Stats

```typescript
// Sync (InMemoryBackend only)
const stats = kernel.memory.stats;

// Async (any backend)
const stats = await kernel.memory.statsAsync();
// { backend: 'sqlite', namespaces: 5, totalEntries: 142 }
```

## Custom Backend

Implement the `MemoryBackend` interface:

```typescript
import type { MemoryBackend, MemoryBackendStats } from '@llmhut/agentvm';

class RedisBackend implements MemoryBackend {
  readonly name = 'redis';

  async get(namespace: string, key: string): Promise<unknown | undefined> { /* ... */ }
  async set(namespace: string, key: string, value: unknown): Promise<void> { /* ... */ }
  async delete(namespace: string, key: string): Promise<boolean> { /* ... */ }
  async list(namespace: string, prefix?: string): Promise<string[]> { /* ... */ }
  async clear(namespace: string): Promise<void> { /* ... */ }
  async deleteNamespace(namespace: string): Promise<void> { /* ... */ }
  async stats(): Promise<MemoryBackendStats> { /* ... */ }
  async close(): Promise<void> { /* ... */ }
}

const kernel = new Kernel({ memoryBackend: new RedisBackend() });
```
