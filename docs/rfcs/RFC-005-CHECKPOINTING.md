# RFC-005: Checkpointing Strategy

> **Status:** draft
>
> **Author:** AgentVM Core Team
>
> **Created:** 2026-04-11

## Summary

Define how AgentVM serializes process state to disk, restores processes from checkpoints, and handles automatic checkpointing on crash.

## Motivation

Agents can run for minutes or hours. A crash (hardware failure, OOM, unhandled error) means losing all in-flight work. Checkpointing lets the kernel save process state periodically and restore from it, making long-running agent workflows crash-resilient.

## Detailed Design

### Checkpoint Format

A checkpoint is a JSON file (`.agentvm-checkpoint`) containing:

```typescript
interface Checkpoint {
  version: string;           // agentvm package version
  savedAt: string;           // ISO timestamp
  process: ProcessInfo;      // id, agentName, state, metadata
  memory: Record<string, MemoryEntry[]>;  // all keys in the process namespace
}
```

### Process.checkpoint()

```typescript
await process.checkpoint('/path/to/checkpoint.json');
// Serializes process.info + all memory keys to JSON
```

### Kernel.restore()

```typescript
const proc = await kernel.restore('/path/to/checkpoint.json');
// Recreates the process in 'paused' state with memory restored
// Caller resumes with kernel.resume(proc.id)
```

### Automatic Crash Checkpointing

When `Process._crash()` is called, if `KernelConfig.checkpointOnCrash` is enabled:

```typescript
const kernel = new Kernel({
  checkpointOnCrash: true,
  checkpointDir: './.agentvm-checkpoints',
});
```

The kernel writes a checkpoint before marking the process as crashed. The operator can then restore and resume.

### Periodic Checkpointing

```typescript
const kernel = new Kernel({
  checkpointInterval: 60_000, // checkpoint all processes every 60s
  checkpointDir: './.agentvm-checkpoints',
});
```

## Trade-offs

- **JSON only for now**: Binary formats (MessagePack, CBOR) are faster but add a dependency. JSON is debuggable and sufficient for v0.3.0.
- **Memory only**: We checkpoint the `MemoryBus` namespace. Running tool calls, pending scheduler tasks, and open MCP connections are not checkpointed — those need to be replayed after restore.
- **No incremental checkpoints**: Full snapshot every time. Incremental diffing is a future optimization.

## Open Questions

1. Should checkpoints be encrypted? API keys could be in memory.
2. How do we handle checkpoints from an older agentvm version?
3. Should MCP connections be automatically re-established on restore?

## References

- `src/core/process.ts` — `Process`, `ProcessInfo`
- `src/memory/bus.ts` — `MemoryBus`, `MemoryEntry`
- [RFC-002](./RFC-002-MEMORY-BUS-INTERFACE.md) — memory contract
