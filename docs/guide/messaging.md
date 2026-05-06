# Messaging

Agents communicate via the MessageBroker. Channels support pub/sub, direct messaging, and priority queues.

## Creating Channels

```typescript
kernel.createChannel({ name: 'updates', type: 'pubsub', historyLimit: 100 });
kernel.createChannel({ name: 'tasks', type: 'direct' });
```

## Publishing (from an Agent)

```typescript
handler: async (ctx) => {
  ctx.publish('updates', { status: 'done', result: 42 });
}
```

## Subscribing

```typescript
kernel.broker.subscribe('updates', 'my-listener', (msg) => {
  console.log(`From ${msg.from}:`, msg.data);
});
```

## Direct Messages

```typescript
kernel.broker.send('tasks', {
  from: 'coordinator',
  to: 'worker-1',
  data: { task: 'process item 42' },
});
```

## Message History

```typescript
const recent = kernel.broker.getHistory('updates', 10);
```

## Stats

```typescript
const stats = kernel.broker.stats;
// { channels: 2, totalMessages: 147, subscribers: 3 }
```
