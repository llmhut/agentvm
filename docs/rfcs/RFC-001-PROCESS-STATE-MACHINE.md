# RFC-001: Process State Machine Design

> **Status:** accepted
>
> **Author:** AgentKernel Core Team
>
> **Created:** 2026-03-26

## Summary

Defines the lifecycle states and valid transitions for agent processes in AgentKernel.

## Motivation

Agents need a well-defined lifecycle so that frameworks and operators can reason about what state an agent is in, what operations are valid, and how to handle crashes gracefully.

## Detailed Design

### States

| State | Description |
|-------|-------------|
| `created` | Process object exists but hasn't started |
| `starting` | Initialization in progress (allocating memory, loading tools) |
| `running` | Actively executing |
| `paused` | Temporarily suspended, can be resumed |
| `terminated` | Cleanly shut down, final state |
| `crashed` | Unhandled error occurred, final state |

### Valid Transitions

```
created    → starting     (spawn)
starting   → running      (automatic after init)
running    → paused       (pause)
paused     → running      (resume)
running    → terminated   (terminate)
paused     → terminated   (terminate)
running    → crashed      (unhandled error)
starting   → crashed      (init failure)
```

Any transition not listed above throws an `InvalidStateTransitionError`.

### Terminal States

`terminated` and `crashed` are terminal. Once a process reaches either state, no further transitions are possible. To restart, spawn a new process.

## Trade-offs

- **No `restarting` state**: We chose simplicity. Restart = spawn a new process. This avoids complex state management around partial restarts.
- **No `stopping` state**: Termination is immediate (via AbortController). If we need graceful shutdown in the future, we can add a `stopping` state in a backward-compatible way.

## Alternatives Considered

- **Erlang-style supervision trees**: Too complex for v0.1. Could be added in Phase 3.
- **Allowing restart from crashed**: Increases complexity. Checkpointing (Phase 3) is a better solution.

## References

- [Erlang Process Model](https://www.erlang.org/doc/reference_manual/processes)
- [Kubernetes Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
