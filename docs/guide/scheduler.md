# Scheduler

Execute tasks across agents with dependency resolution and retry policies.

## Strategies

```typescript
import { Scheduler } from '@llmhut/agentvm';

const scheduler = kernel.scheduler; // or new Scheduler(kernel)
```

### Sequential

Tasks run one after another:

```typescript
await scheduler.run('sequential', [
  { id: 'step1', agentName: 'fetcher', input: 'https://example.com' },
  { id: 'step2', agentName: 'parser', input: '...' },
]);
```

### Parallel

All tasks run concurrently:

```typescript
await scheduler.run('parallel', [
  { id: 'a', agentName: 'worker', input: 'task-a' },
  { id: 'b', agentName: 'worker', input: 'task-b' },
  { id: 'c', agentName: 'worker', input: 'task-c' },
]);
```

### Race

First task to complete wins:

```typescript
const result = await scheduler.run('race', tasks);
```

### Conditional

Tasks with dependencies:

```typescript
await scheduler.run('conditional', [
  { id: 'fetch', agentName: 'fetcher', input: 'url' },
  { id: 'parse', agentName: 'parser', input: '...', dependsOn: ['fetch'] },
  { id: 'store', agentName: 'saver', input: '...', dependsOn: ['parse'] },
]);
```

## Retry Policies

```typescript
{
  id: 'flaky-task',
  agentName: 'api-caller',
  input: '...',
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    delayMs: 1000,
  },
}
```
