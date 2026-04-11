# RFC-002: Memory Bus Interface Contract

> **Status:** accepted
>
> **Author:** AgentVM Core Team
>
> **Created:** 2026-03-28
>
> **Updated:** 2026-04-11

## Summary

Defines the interface contract, namespace model, and backend abstraction for the AgentVM Memory Bus. Establishes how processes access memory, how isolation is enforced, and how pluggable backends will be added in v0.3.0.

## Motivation

Every agent needs somewhere to store state between tool calls and across executions. Ad-hoc maps aren't enough — we need namespacing (so processes can't stomp each other), a shared tier (so agents can coordinate), TTL support (so stale data doesn't accumulate), and a backend interface (so SQLite/Redis can replace the in-memory store without changing agent code).

## Detailed Design

### MemoryAccessor Interface

All memory access goes through a `MemoryAccessor` — a namespaced view over a backend store.

```typescript
interface MemoryAccessor {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}
```

Agents never touch the `MemoryBus` directly — they receive a pre-scoped accessor via `ExecutionContext.memory`. This means agent code is portable across backends without modification.

### Namespace Model

The `MemoryBus` allocates one store per namespace string:

| Namespace | Owner | Lifecycle |
|-----------|-------|-----------|
| `<processId>` | One process | Deleted on `kernel.terminate()` unless `memory.persistent: true` |
| `__shared__` | All processes | Lives for the duration of the kernel |

Process namespaces are fully isolated — one process cannot read another's namespace by accident.

### Reserved Keys

Keys prefixed with `__` are reserved for AgentVM internals:

| Key | Set by | Contents |
|-----|--------|----------|
| `__tool_schemas` | `Kernel.spawn()` | Array of tool name/description/parameters for LLM agents |
| `__llm_messages` | `createLLMAgent()` | Conversation history for multi-turn LLM agents |
| `__llm_usage` | `createLLMAgent()` | Cumulative `{ inputTokens, outputTokens }` |

### TTL Support

`MemoryEntry` has an optional `ttl` field (milliseconds). The default in-memory backend checks TTL on every `get()` and lazily evicts expired entries. Backends are not required to actively purge — lazy eviction on read is sufficient for correctness.

### Backend Interface

Pluggable backends implement the same `MemoryStore` contract. The `MemoryConfig.backend` field on `AgentConfig` selects the backend:

```typescript
interface MemoryConfig {
  persistent?: boolean;
  backend?: 'memory' | 'sqlite' | 'redis' | 'postgres';
  namespace?: string;
}
```

The default backend is `'memory'` (in-process Map). `'sqlite'`, `'redis'`, and `'postgres'` backends are planned for v0.3.0.

### MemoryBus API

```typescript
class MemoryBus {
  getAccessor(namespace: string): MemoryAccessor;
  getSharedAccessor(): MemoryAccessor;  // shorthand for getAccessor('__shared__')
  deleteNamespace(namespace: string): void;
  stats: { namespaces: number; totalEntries: number };
}
```

## Trade-offs

- **No cross-namespace reads**: Agents cannot access other processes' working memory. This is intentional — use `__shared__` or the `MessageBroker` for cross-agent coordination.
- **Lazy TTL eviction**: Expired entries occupy memory until they are read. Active background eviction would add complexity; acceptable for v0.2.x.
- **No transactions**: Atomic multi-key operations are not supported. Use the `MessageBroker` for coordination that requires atomicity.

## Alternatives Considered

- **Global flat key-value store with key prefixes**: Simpler, but namespacing via prefixes is easy to break accidentally and doesn't support per-process lifecycle cleanup.
- **Per-agent store (not per-process)**: Makes parallel instances of the same agent share state unintentionally.

## Migration Strategy

Non-breaking. The `MemoryBus` interface is additive. When backend plugins land in v0.3.0, agents only need to set `memory: { backend: 'sqlite' }` in their config — no other code changes.

## References

- [RFC-001: Process State Machine Design](./RFC-001-PROCESS-STATE-MACHINE.md)
- `src/memory/bus.ts`
- `src/core/types.ts` — `MemoryAccessor`, `MemoryEntry`, `MemoryConfig`
