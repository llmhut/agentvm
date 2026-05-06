# Kernel

The central orchestrator. All operations go through the kernel.

## Constructor

```typescript
const kernel = new Kernel({
  name: 'my-app',
  debug: false,
  memoryBackend: backend,
  maxProcesses: 100,
  on: { 'process:spawned': (e) => console.log(e) },
});
```

## Agent Management

| Method | Description |
|--------|-------------|
| `register(...agents)` | Register one or more agents |
| `getAgent(name)` | Get a registered agent by name |
| `agents` | Array of all registered agents |

## Process Lifecycle

| Method | Returns | Description |
|--------|---------|-------------|
| `spawn(name, options?)` | `Process` | Create a running process |
| `execute(processId, input)` | `ExecutionResult` | Run a task |
| `pause(processId)` | `void` | Pause a process |
| `resume(processId)` | `void` | Resume a paused process |
| `terminate(processId)` | `void` | Terminate a process |
| `getProcess(id)` | `Process` | Get process by ID |

## Infrastructure

| Property / Method | Description |
|--------|-------------|
| `memory` | MemoryBus instance |
| `tools` | ToolRouter instance |
| `broker` | MessageBroker instance |
| `registerTool(def)` | Register a tool |
| `createChannel(config)` | Create a message channel |
| `stats()` | Aggregate stats (async) |
| `shutdown()` | Terminate all processes |

## ExecutionResult

| Field | Type | Description |
|-------|------|-------------|
| `processId` | `string` | Process that ran |
| `agentName` | `string` | Agent name |
| `output` | `unknown` | Handler return value |
| `duration` | `number` | Wall-clock ms |
| `tokensUsed` | `number?` | LLM tokens used |
| `events` | `KernelEvent[]` | Events emitted |
