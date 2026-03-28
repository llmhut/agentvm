import { describe, it, expect } from 'vitest';
import { MemoryBus } from '../../src/memory/bus';
import {
  ToolRouter,
  ToolNotFoundError,
  ToolExecutionError,
  ToolRateLimitError,
} from '../../src/tools/router';
import { MessageBroker } from '../../src/broker/broker';
import { Scheduler } from '../../src/scheduler/scheduler';

// ════════════════════════════════════════════════
// MemoryBus
// ════════════════════════════════════════════════

describe('MemoryBus', () => {
  it('should isolate memory per namespace', async () => {
    const bus = new MemoryBus();
    const m1 = bus.getAccessor('ns1');
    const m2 = bus.getAccessor('ns2');

    await m1.set('key', 'val1');
    await m2.set('key', 'val2');
    expect(await m1.get('key')).toBe('val1');
    expect(await m2.get('key')).toBe('val2');
  });

  it('should return undefined for missing keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    expect(await mem.get('nope')).toBeUndefined();
  });

  it('should overwrite existing keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    await mem.set('k', 'v1');
    await mem.set('k', 'v2');
    expect(await mem.get('k')).toBe('v2');
  });

  it('should provide shared memory accessor', async () => {
    const bus = new MemoryBus();
    const shared = bus.getSharedAccessor();
    await shared.set('global', 42);
    expect(await shared.get('global')).toBe(42);

    // Same shared namespace from another call
    const shared2 = bus.getSharedAccessor();
    expect(await shared2.get('global')).toBe(42);
  });

  it('should list all keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    await mem.set('a', 1);
    await mem.set('b', 2);
    await mem.set('c', 3);
    const keys = await mem.list();
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('should list keys with prefix filter', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    await mem.set('user:1', 'alice');
    await mem.set('user:2', 'bob');
    await mem.set('task:1', 'clean');

    expect(await mem.list('user:')).toEqual(['user:1', 'user:2']);
    expect(await mem.list('task:')).toEqual(['task:1']);
    expect(await mem.list('nope:')).toEqual([]);
  });

  it('should delete keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    await mem.set('k', 'v');
    expect(await mem.delete('k')).toBe(true);
    expect(await mem.get('k')).toBeUndefined();
    expect(await mem.delete('nonexistent')).toBe(false);
  });

  it('should clear all keys', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    await mem.set('a', 1);
    await mem.set('b', 2);
    await mem.clear();
    expect(await mem.list()).toEqual([]);
  });

  it('should delete entire namespace', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('temp');
    await mem.set('k', 'v');
    bus.deleteNamespace('temp');
    const fresh = bus.getAccessor('temp');
    expect(await fresh.get('k')).toBeUndefined();
  });

  it('should report accurate stats', async () => {
    const bus = new MemoryBus();
    expect(bus.stats).toEqual({ namespaces: 0, totalEntries: 0 });

    const m1 = bus.getAccessor('a');
    await m1.set('x', 1);
    await m1.set('y', 2);
    const m2 = bus.getAccessor('b');
    await m2.set('z', 3);

    expect(bus.stats).toEqual({ namespaces: 2, totalEntries: 3 });
  });

  it('should reuse accessor for same namespace', async () => {
    const bus = new MemoryBus();
    const m1 = bus.getAccessor('ns');
    await m1.set('k', 'v');
    const m2 = bus.getAccessor('ns');
    expect(await m2.get('k')).toBe('v');
  });

  it('should store complex objects', async () => {
    const bus = new MemoryBus();
    const mem = bus.getAccessor('ns');
    const obj = { nested: { arr: [1, 2, 3], flag: true } };
    await mem.set('complex', obj);
    expect(await mem.get('complex')).toEqual(obj);
  });
});

// ════════════════════════════════════════════════
// ToolRouter
// ════════════════════════════════════════════════

describe('ToolRouter', () => {
  const ctx = () => ({
    agentName: 'test',
    processId: 'p1',
    signal: new AbortController().signal,
  });

  const simpleTool = (name = 'echo') => ({
    name,
    description: `${name} tool`,
    parameters: { type: 'string' as const },
    sideEffects: 'none' as const,
    permission: 'public' as const,
    handler: async (params: unknown) => params,
  });

  it('should register and invoke a tool', async () => {
    const r = new ToolRouter();
    r.register(simpleTool());
    expect(await r.invoke('echo', 'hi', ctx())).toBe('hi');
  });

  it('should throw ToolNotFoundError for unknown tools', async () => {
    const r = new ToolRouter();
    await expect(r.invoke('nope', {}, ctx())).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it('should reject duplicate registration', () => {
    const r = new ToolRouter();
    r.register(simpleTool());
    expect(() => r.register(simpleTool())).toThrow('already registered');
  });

  it('should unregister tools', () => {
    const r = new ToolRouter();
    r.register(simpleTool());
    r.unregister('echo');
    expect(r.getTool('echo')).toBeUndefined();
  });

  it('should list all tools', () => {
    const r = new ToolRouter();
    r.register(simpleTool('a'));
    r.register(simpleTool('b'));
    expect(r.tools).toHaveLength(2);
  });

  it('should get tool by name', () => {
    const r = new ToolRouter();
    r.register(simpleTool());
    expect(r.getTool('echo')?.name).toBe('echo');
    expect(r.getTool('nope')).toBeUndefined();
  });

  it('should get available tools for agent', () => {
    const r = new ToolRouter();
    r.register(simpleTool('a'));
    r.register(simpleTool('b'));
    r.register(simpleTool('c'));
    const available = r.getAvailableTools(['a', 'c', 'nonexistent']);
    expect(available).toHaveLength(2);
    expect(available.map((t) => t.name)).toEqual(['a', 'c']);
  });

  it('should enforce rate limits', async () => {
    const r = new ToolRouter();
    r.register({ ...simpleTool(), rateLimit: 2 });
    const c = ctx();

    await r.invoke('echo', 'a', c);
    await r.invoke('echo', 'b', c);
    await expect(r.invoke('echo', 'c', c)).rejects.toBeInstanceOf(ToolRateLimitError);
  });

  it('should reset rate limits after window expires', async () => {
    const r = new ToolRouter();
    r.register({ ...simpleTool(), rateLimit: 1 });
    const c = ctx();

    await r.invoke('echo', 'a', c);
    // Manually reset the counter by accessing private state
    (r as unknown as { _rateLimitCounters: Map<string, { count: number; resetAt: number }> })
      ._rateLimitCounters.set('echo:test', { count: 0, resetAt: Date.now() - 1 });
    await expect(r.invoke('echo', 'b', c)).resolves.toBe('b');
  });

  it('should track rate limits per agent', async () => {
    const r = new ToolRouter();
    r.register({ ...simpleTool(), rateLimit: 1 });

    const c1 = { ...ctx(), agentName: 'agent1' };
    const c2 = { ...ctx(), agentName: 'agent2' };

    await r.invoke('echo', 'a', c1);
    await expect(r.invoke('echo', 'b', c1)).rejects.toThrow(); // agent1 limit hit
    await expect(r.invoke('echo', 'c', c2)).resolves.toBe('c'); // agent2 still ok
  });

  it('should wrap handler errors in ToolExecutionError', async () => {
    const r = new ToolRouter();
    r.register({
      ...simpleTool(),
      handler: async () => { throw new Error('handler broke'); },
    });
    await expect(r.invoke('echo', {}, ctx())).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it('should wrap non-Error handler throws', async () => {
    const r = new ToolRouter();
    r.register({
      ...simpleTool(),
      handler: async () => { throw 'string-throw'; },
    });
    await expect(r.invoke('echo', {}, ctx())).rejects.toBeInstanceOf(ToolExecutionError);
  });
});

// ════════════════════════════════════════════════
// MessageBroker
// ════════════════════════════════════════════════

describe('MessageBroker', () => {
  it('should create channels', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    expect(b.getChannel('ch')).toBeDefined();
  });

  it('should reject duplicate channels', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    expect(() => b.createChannel({ name: 'ch', type: 'pubsub' })).toThrow('already exists');
  });

  it('should delete channels', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    b.deleteChannel('ch');
    expect(b.getChannel('ch')).toBeUndefined();
  });

  it('should publish and deliver to subscribers', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    const received: unknown[] = [];
    b.subscribe('ch', 'sub1', (m) => received.push(m.data));

    b.publish('ch', 'pub1', 'msg1');
    b.publish('ch', 'pub1', 'msg2');
    expect(received).toEqual(['msg1', 'msg2']);
  });

  it('should not deliver to sender', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    const received: unknown[] = [];
    b.subscribe('ch', 'agent1', (m) => received.push(m.data));

    b.publish('ch', 'agent1', 'self');
    expect(received).toEqual([]);

    b.publish('ch', 'agent2', 'other');
    expect(received).toEqual(['other']);
  });

  it('should deliver to multiple subscribers', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    b.subscribe('ch', 'sub1', (m) => r1.push(m.data));
    b.subscribe('ch', 'sub2', (m) => r2.push(m.data));

    b.publish('ch', 'pub', 'hello');
    expect(r1).toEqual(['hello']);
    expect(r2).toEqual(['hello']);
  });

  it('should support unsubscribe', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    const received: unknown[] = [];
    const unsub = b.subscribe('ch', 'sub', (m) => received.push(m.data));

    b.publish('ch', 'pub', 'before');
    unsub();
    b.publish('ch', 'pub', 'after');
    expect(received).toEqual(['before']);
  });

  it('should handle subscriber errors gracefully', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    b.subscribe('ch', 'bad', () => { throw new Error('oops'); });

    // Should not throw
    expect(() => b.publish('ch', 'pub', 'data')).not.toThrow();
  });

  it('should support direct messaging', () => {
    const b = new MessageBroker();
    const msg = b.sendDirect('alice', 'bob', 'hello');
    expect(msg.from).toBe('alice');
    expect(msg.data).toBe('hello');
    expect(msg.channel).toContain('__direct__');
  });

  it('should reuse direct channel for same pair', () => {
    const b = new MessageBroker();
    b.sendDirect('alice', 'bob', 'msg1');
    b.sendDirect('bob', 'alice', 'msg2');
    // Both should use the same channel (sorted names)
    expect(b.stats.channels).toBe(1);
  });

  it('should maintain channel history with limit', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub', historyLimit: 2 });

    b.publish('ch', 'a', 'msg1');
    b.publish('ch', 'a', 'msg2');
    b.publish('ch', 'a', 'msg3');

    const ch = b.getChannel('ch');
    expect(ch?.history).toHaveLength(2);
    expect(ch?.history[0].data).toBe('msg2');
  });

  it('should reject publishing to nonexistent channel', () => {
    const b = new MessageBroker();
    expect(() => b.publish('nope', 'a', 'x')).toThrow('does not exist');
  });

  it('should reject subscribing to nonexistent channel', () => {
    const b = new MessageBroker();
    expect(() => b.subscribe('nope', 'sub', () => {})).toThrow('does not exist');
  });

  it('should list channels', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'a', type: 'pubsub' });
    b.createChannel({ name: 'b', type: 'direct' });
    expect(b.channels).toHaveLength(2);
  });

  it('should report stats', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    b.publish('ch', 'a', 'x');
    b.publish('ch', 'a', 'y');
    expect(b.stats).toEqual({ channels: 1, totalMessages: 2 });
  });

  it('should return message with correct structure', () => {
    const b = new MessageBroker();
    b.createChannel({ name: 'ch', type: 'pubsub' });
    const msg = b.publish('ch', 'sender', { key: 'val' });
    expect(msg.id).toBeDefined();
    expect(msg.channel).toBe('ch');
    expect(msg.from).toBe('sender');
    expect(msg.data).toEqual({ key: 'val' });
    expect(msg.timestamp).toBeInstanceOf(Date);
  });
});

// ════════════════════════════════════════════════
// Scheduler
// ════════════════════════════════════════════════

describe('Scheduler', () => {
  const task = (id: string, extra: Partial<import('../../src/core/types').TaskDefinition> = {}): import('../../src/core/types').TaskDefinition => ({
    id,
    agentName: 'test',
    input: id,
    ...extra,
  });

  it('should execute sequentially', async () => {
    const s = new Scheduler();
    const order: string[] = [];
    const executor = async (t: { id: string }) => { order.push(t.id); return t.id; };

    const results = await s.execute([task('a'), task('b'), task('c')], 'sequential', executor);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(results.get('a')).toBe('a');
    expect(results.get('c')).toBe('c');
  });

  it('should execute in parallel', async () => {
    const s = new Scheduler();
    const results = await s.execute(
      [task('a'), task('b'), task('c')],
      'parallel',
      async (t) => t.id,
    );
    expect(results.size).toBe(3);
  });

  it('should execute race (first wins)', async () => {
    const s = new Scheduler();
    const results = await s.execute(
      [task('slow'), task('fast')],
      'race',
      async (t) => {
        if (t.id === 'slow') await new Promise((r) => setTimeout(r, 50));
        return t.id;
      },
    );
    expect(results.size).toBe(1);
    expect(results.get('fast')).toBe('fast');
  });

  it('should execute conditional (stop on falsy)', async () => {
    const s = new Scheduler();
    const order: string[] = [];
    const results = await s.execute(
      [task('a'), task('b'), task('c')],
      'conditional',
      async (t) => {
        order.push(t.id);
        return t.id === 'b' ? null : t.id;
      },
    );
    expect(order).toEqual(['a', 'b']);
    expect(results.get('a')).toBe('a');
    expect(results.get('b')).toBeNull();
    expect(results.has('c')).toBe(false);
  });

  it('should execute conditional (all truthy runs all)', async () => {
    const s = new Scheduler();
    const results = await s.execute(
      [task('a'), task('b')],
      'conditional',
      async (t) => t.id,
    );
    expect(results.size).toBe(2);
  });

  it('should throw on unknown strategy', async () => {
    const s = new Scheduler();
    await expect(
      s.execute([task('a')], 'unknown' as 'sequential', async () => null)
    ).rejects.toThrow('Unknown strategy');
  });

  it('should respect dependency order in sequential', async () => {
    const s = new Scheduler();
    const order: string[] = [];
    await s.execute(
      [task('b', { dependsOn: ['a'] }), task('a')],
      'sequential',
      async (t) => { order.push(t.id); return t.id; },
    );
    expect(order).toEqual(['a', 'b']);
  });

  it('should respect dependency layers in parallel', async () => {
    const s = new Scheduler();
    const order: string[] = [];
    await s.execute(
      [
        task('c', { dependsOn: ['a', 'b'] }),
        task('a'),
        task('b'),
      ],
      'parallel',
      async (t) => { order.push(t.id); return t.id; },
    );
    // a and b should both complete before c
    expect(order.indexOf('c')).toBe(2);
  });

  it('should detect circular dependencies', async () => {
    const s = new Scheduler();
    await expect(
      s.execute(
        [task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['a'] })],
        'parallel',
        async () => null,
      )
    ).rejects.toThrow('Circular dependency');
  });

  it('should fail fast on sequential errors', async () => {
    const s = new Scheduler();
    await expect(
      s.execute(
        [task('a'), task('b')],
        'sequential',
        async (t) => { if (t.id === 'a') throw new Error('fail'); return t.id; },
      )
    ).rejects.toThrow('fail');

    expect(s.stats.failed).toBe(1);
  });

  it('should continue on parallel errors', async () => {
    const s = new Scheduler();
    const results = await s.execute(
      [task('a'), task('b')],
      'parallel',
      async (t) => { if (t.id === 'a') throw new Error('fail'); return t.id; },
    );
    expect(results.has('b')).toBe(true);
    expect(results.has('a')).toBe(false);
    expect(s.stats.failed).toBe(1);
  });

  it('should retry with fixed backoff', async () => {
    const s = new Scheduler();
    let attempts = 0;
    const results = await s.execute(
      [task('a', { retry: { maxAttempts: 3, backoff: 'fixed', delayMs: 10 } })],
      'sequential',
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('retry');
        return 'ok';
      },
    );
    expect(attempts).toBe(3);
    expect(results.get('a')).toBe('ok');
  });

  it('should retry with exponential backoff', async () => {
    const s = new Scheduler();
    let attempts = 0;
    const results = await s.execute(
      [task('a', { retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 5 } })],
      'sequential',
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('retry');
        return 'ok';
      },
    );
    expect(attempts).toBe(3);
    expect(results.get('a')).toBe('ok');
  });

  it('should throw after max retry attempts', async () => {
    const s = new Scheduler();
    await expect(
      s.execute(
        [task('a', { retry: { maxAttempts: 2, backoff: 'fixed', delayMs: 5 } })],
        'sequential',
        async () => { throw new Error('always-fail'); },
      )
    ).rejects.toThrow('always-fail');
  });

  // Queue management

  it('should enqueue and sort by priority', () => {
    const s = new Scheduler();
    s.enqueue(task('low', { priority: 1 }));
    s.enqueue(task('high', { priority: 10 }));
    s.enqueue(task('mid', { priority: 5 }));
    expect(s.stats.queued).toBe(3);
  });

  it('should enqueue multiple at once', () => {
    const s = new Scheduler();
    s.enqueueAll([task('a'), task('b'), task('c')]);
    expect(s.stats.queued).toBe(3);
  });

  it('should report accurate stats', async () => {
    const s = new Scheduler();
    expect(s.stats).toEqual({ queued: 0, running: 0, completed: 0, failed: 0 });

    await s.execute([task('a'), task('b')], 'sequential', async (t) => t.id);
    expect(s.stats.completed).toBe(2);
    expect(s.stats.running).toBe(0);
  });
});
