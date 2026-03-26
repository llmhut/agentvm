import { describe, it, expect, vi } from 'vitest';
import { MemoryBus } from '../../src/memory/bus';
import { ToolRouter, ToolNotFoundError, ToolRateLimitError } from '../../src/tools/router';
import { MessageBroker } from '../../src/broker/broker';

// ── MemoryBus Tests ──

describe('MemoryBus', () => {
  it('should provide isolated memory per namespace', async () => {
    const bus = new MemoryBus();
    const mem1 = bus.getAccessor('ns1');
    const mem2 = bus.getAccessor('ns2');

    await mem1.set('key', 'value-1');
    await mem2.set('key', 'value-2');

    expect(await mem1.get('key')).toBe('value-1');
    expect(await mem2.get('key')).toBe('value-2');
  });

  it('should support shared memory', async () => {
    const bus = new MemoryBus();
    const shared = bus.getSharedAccessor();

    await shared.set('config', { model: 'claude' });
    expect(await shared.get('config')).toEqual({ model: 'claude' });
  });

  it('should list keys with prefix', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('test');

    await mem.set('tasks:1', 'a');
    await mem.set('tasks:2', 'b');
    await mem.set('notes:1', 'c');

    const taskKeys = await mem.list('tasks:');
    expect(taskKeys).toEqual(['tasks:1', 'tasks:2']);
  });

  it('should delete keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('test');

    await mem.set('key', 'value');
    expect(await mem.delete('key')).toBe(true);
    expect(await mem.get('key')).toBeUndefined();
  });

  it('should clear all keys in a namespace', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('test');

    await mem.set('a', 1);
    await mem.set('b', 2);
    await mem.clear();

    expect(await mem.list()).toEqual([]);
  });

  it('should delete an entire namespace', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('temp');
    await mem.set('key', 'val');

    bus.deleteNamespace('temp');
    const freshMem = bus.getAccessor('temp');
    expect(await freshMem.get('key')).toBeUndefined();
  });

  it('should report stats', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('test');
    await mem.set('a', 1);
    await mem.set('b', 2);

    const stats = bus.stats;
    expect(stats.namespaces).toBe(1);
    expect(stats.totalEntries).toBe(2);
  });
});

// ── ToolRouter Tests ──

describe('ToolRouter', () => {
  const mockTool = {
    name: 'echo',
    description: 'Returns input as output',
    parameters: { type: 'string' as const },
    sideEffects: 'none' as const,
    permission: 'public' as const,
    handler: async (params: unknown) => params,
  };

  it('should register and invoke a tool', async () => {
    const router = new ToolRouter();
    router.register(mockTool);

    const result = await router.invoke('echo', 'hello', {
      agentName: 'test',
      processId: 'proc-1',
      signal: new AbortController().signal,
    });

    expect(result).toBe('hello');
  });

  it('should throw ToolNotFoundError for unknown tools', async () => {
    const router = new ToolRouter();
    await expect(
      router.invoke('nonexistent', {}, {
        agentName: 'test',
        processId: 'proc-1',
        signal: new AbortController().signal,
      })
    ).rejects.toThrow(ToolNotFoundError);
  });

  it('should reject duplicate tool registration', () => {
    const router = new ToolRouter();
    router.register(mockTool);
    expect(() => router.register(mockTool)).toThrow('already registered');
  });

  it('should enforce rate limits', async () => {
    const router = new ToolRouter();
    router.register({ ...mockTool, rateLimit: 2 });

    const ctx = {
      agentName: 'test',
      processId: 'proc-1',
      signal: new AbortController().signal,
    };

    await router.invoke('echo', 'a', ctx);
    await router.invoke('echo', 'b', ctx);
    await expect(router.invoke('echo', 'c', ctx)).rejects.toThrow(ToolRateLimitError);
  });

  it('should list all tools', () => {
    const router = new ToolRouter();
    router.register(mockTool);
    expect(router.tools.length).toBe(1);
    expect(router.tools[0].name).toBe('echo');
  });

  it('should unregister a tool', () => {
    const router = new ToolRouter();
    router.register(mockTool);
    router.unregister('echo');
    expect(router.getTool('echo')).toBeUndefined();
  });
});

// ── MessageBroker Tests ──

describe('MessageBroker', () => {
  it('should create a channel and publish messages', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'test', type: 'pubsub' });

    const msg = broker.publish('test', 'sender-1', { hello: 'world' });
    expect(msg.channel).toBe('test');
    expect(msg.from).toBe('sender-1');
    expect(msg.data).toEqual({ hello: 'world' });
  });

  it('should deliver messages to subscribers', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'updates', type: 'pubsub' });

    const received: unknown[] = [];
    broker.subscribe('updates', 'listener-1', (msg) => {
      received.push(msg.data);
    });

    broker.publish('updates', 'sender-1', 'message-1');
    broker.publish('updates', 'sender-1', 'message-2');

    expect(received).toEqual(['message-1', 'message-2']);
  });

  it('should not deliver messages to sender', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'ch', type: 'pubsub' });

    const received: unknown[] = [];
    broker.subscribe('ch', 'agent-1', (msg) => {
      received.push(msg.data);
    });

    // agent-1 sends — should NOT receive its own message
    broker.publish('ch', 'agent-1', 'self-message');
    expect(received).toEqual([]);

    // agent-2 sends — agent-1 SHOULD receive
    broker.publish('ch', 'agent-2', 'other-message');
    expect(received).toEqual(['other-message']);
  });

  it('should support unsubscribe', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'ch', type: 'pubsub' });

    const received: unknown[] = [];
    const unsub = broker.subscribe('ch', 'listener', (msg) => {
      received.push(msg.data);
    });

    broker.publish('ch', 'sender', 'before-unsub');
    unsub();
    broker.publish('ch', 'sender', 'after-unsub');

    expect(received).toEqual(['before-unsub']);
  });

  it('should support direct messaging', () => {
    const broker = new MessageBroker();

    const received: unknown[] = [];
    // Direct messages auto-create a channel
    const msg = broker.sendDirect('alice', 'bob', 'hello bob');
    expect(msg.from).toBe('alice');
    expect(msg.data).toBe('hello bob');
  });

  it('should maintain channel history', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'ch', type: 'pubsub', historyLimit: 3 });

    broker.publish('ch', 'a', 'msg-1');
    broker.publish('ch', 'a', 'msg-2');
    broker.publish('ch', 'a', 'msg-3');
    broker.publish('ch', 'a', 'msg-4');

    const channel = broker.getChannel('ch');
    expect(channel?.history.length).toBe(3);
  });

  it('should reject publishing to nonexistent channel', () => {
    const broker = new MessageBroker();
    expect(() => broker.publish('nope', 'sender', 'data')).toThrow('does not exist');
  });

  it('should report stats', () => {
    const broker = new MessageBroker();
    broker.createChannel({ name: 'ch', type: 'pubsub' });
    broker.publish('ch', 'a', 'msg');

    expect(broker.stats.channels).toBe(1);
    expect(broker.stats.totalMessages).toBe(1);
  });
});
