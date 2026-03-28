import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { Agent } from '../../src/core/agent';
import { Process } from '../../src/core/process';
import { ProcessState } from '../../src/core/types';

// ════════════════════════════════════════════════
// Agent
// ════════════════════════════════════════════════

describe('Agent', () => {
  it('should create with required fields only', () => {
    const agent = new Agent({ name: 'test-agent' });
    expect(agent.name).toBe('test-agent');
    expect(agent.description).toBe('');
    expect(agent.tools).toEqual([]);
    expect(agent.memory).toEqual({});
    expect(agent.contract).toBeUndefined();
    expect(agent.handler).toBeUndefined();
  });

  it('should create with all fields', () => {
    const handler = async () => 'result';
    const agent = new Agent({
      name: 'full',
      description: 'Full agent',
      tools: ['a', 'b'],
      memory: { persistent: true, backend: 'redis' },
      contract: { input: { type: 'string' }, maxLatency: 5000 },
      handler,
    });
    expect(agent.description).toBe('Full agent');
    expect(agent.tools).toEqual(['a', 'b']);
    expect(agent.memory.persistent).toBe(true);
    expect(agent.contract?.maxLatency).toBe(5000);
    expect(agent.handler).toBe(handler);
  });

  it('should reject empty name', () => {
    expect(() => new Agent({ name: '' })).toThrow('Agent name is required');
  });

  it('should reject whitespace-only name', () => {
    expect(() => new Agent({ name: '   ' })).toThrow('Agent name is required');
  });

  it('should reject name starting with number', () => {
    expect(() => new Agent({ name: '123abc' })).toThrow('Invalid agent name');
  });

  it('should reject name with spaces', () => {
    expect(() => new Agent({ name: 'has spaces' })).toThrow('Invalid agent name');
  });

  it('should reject name with special chars', () => {
    expect(() => new Agent({ name: 'agent@home' })).toThrow('Invalid agent name');
  });

  it('should allow hyphens and underscores', () => {
    const a1 = new Agent({ name: 'my-agent' });
    const a2 = new Agent({ name: 'my_agent' });
    const a3 = new Agent({ name: 'Agent123' });
    expect(a1.name).toBe('my-agent');
    expect(a2.name).toBe('my_agent');
    expect(a3.name).toBe('Agent123');
  });

  it('should serialize to JSON without handler', () => {
    const agent = new Agent({ name: 'test', description: 'Desc', tools: ['x'] });
    const json = agent.toJSON();
    expect(json.name).toBe('test');
    expect(json.description).toBe('Desc');
    expect(json.tools).toEqual(['x']);
    expect(json).not.toHaveProperty('handler');
  });

  it('should produce readable toString', () => {
    const agent = new Agent({ name: 'bot' });
    expect(agent.toString()).toBe('Agent(bot)');
  });
});

// ════════════════════════════════════════════════
// Process (direct instantiation for unit testing)
// ════════════════════════════════════════════════

describe('Process', () => {
  it('should create with initial state', () => {
    const proc = new Process('p1', 'agent-a');
    expect(proc.id).toBe('p1');
    expect(proc.agentName).toBe('agent-a');
    expect(proc.state).toBe(ProcessState.Created);
    expect(proc.createdAt).toBeInstanceOf(Date);
    expect(proc.events).toHaveLength(0);
  });

  it('should transition: created → running', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    expect(proc.state).toBe(ProcessState.Running);
    expect(proc.events[0].type).toBe('process:started');
  });

  it('should transition: running → paused → running', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    proc._pause();
    expect(proc.state).toBe(ProcessState.Paused);
    proc._resume();
    expect(proc.state).toBe(ProcessState.Running);
  });

  it('should transition: running → terminated', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    proc._terminate();
    expect(proc.state).toBe(ProcessState.Terminated);
    expect(proc.signal.aborted).toBe(true);
  });

  it('should be idempotent on double terminate', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    proc._terminate();
    proc._terminate(); // should not throw
    expect(proc.state).toBe(ProcessState.Terminated);
  });

  it('should transition to crashed', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    proc._crash(new Error('boom'));
    expect(proc.state).toBe(ProcessState.Crashed);
    expect(proc.signal.aborted).toBe(true);
    expect(proc.events.at(-1)?.data).toHaveProperty('error', 'boom');
  });

  it('should reject invalid state transitions', () => {
    const proc = new Process('p1', 'a');
    // can't pause a created process
    expect(() => proc._pause()).toThrow('expected state "running"');
    // can't resume a created process
    expect(() => proc._resume()).toThrow('expected state "paused"');
  });

  it('should reject starting a running process', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    expect(() => proc._start()).toThrow('expected state "created"');
  });

  it('should reject pausing a paused process', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    proc._pause();
    expect(() => proc._pause()).toThrow('expected state "running"');
  });

  it('should store and retrieve metadata', () => {
    const proc = new Process('p1', 'a', { metadata: { role: 'worker' } });
    expect(proc.getMetadata('role')).toBe('worker');
    proc.setMetadata('status', 'busy');
    expect(proc.getMetadata('status')).toBe('busy');
    expect(proc.getMetadata('nonexistent')).toBeUndefined();
  });

  it('should provide ProcessInfo snapshot', () => {
    const proc = new Process('p1', 'a', { metadata: { x: 1 } });
    proc._start();
    const info = proc.info;
    expect(info.id).toBe('p1');
    expect(info.agentName).toBe('a');
    expect(info.state).toBe(ProcessState.Running);
    expect(info.startedAt).toBeInstanceOf(Date);
    expect(info.metadata).toEqual({ x: 1 });
    // info.metadata should be a copy
    info.metadata.x = 999;
    expect(proc.getMetadata('x')).toBe(1);
  });

  it('should expose abort signal', () => {
    const proc = new Process('p1', 'a');
    expect(proc.signal).toBeInstanceOf(AbortSignal);
    expect(proc.signal.aborted).toBe(false);
  });

  it('should produce readable toString', () => {
    const proc = new Process('p1', 'bot');
    expect(proc.toString()).toContain('p1');
    expect(proc.toString()).toContain('bot');
    expect(proc.toString()).toContain('created');
  });

  it('should track terminated timestamp', () => {
    const proc = new Process('p1', 'a');
    proc._start();
    expect(proc.info.terminatedAt).toBeUndefined();
    proc._terminate();
    expect(proc.info.terminatedAt).toBeInstanceOf(Date);
  });
});

// ════════════════════════════════════════════════
// Kernel — Registration & Lifecycle
// ════════════════════════════════════════════════

describe('Kernel', () => {
  it('should default name to agentvm', () => {
    expect(new Kernel().name).toBe('agentvm');
  });

  it('should accept custom name', () => {
    expect(new Kernel({ name: 'app' }).name).toBe('app');
  });

  it('should expose memory, tools, broker', () => {
    const k = new Kernel();
    expect(k.memory).toBeDefined();
    expect(k.tools).toBeDefined();
    expect(k.broker).toBeDefined();
  });

  it('should register and retrieve agents', () => {
    const k = new Kernel();
    const a = new Agent({ name: 'bot' });
    k.register(a);
    expect(k.getAgent('bot')).toBe(a);
    expect(k.agents).toHaveLength(1);
  });

  it('should register multiple agents at once', () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }), new Agent({ name: 'b' }), new Agent({ name: 'c' }));
    expect(k.agents).toHaveLength(3);
  });

  it('should reject duplicate registration', () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    expect(() => k.register(new Agent({ name: 'a' }))).toThrow('already registered');
  });

  it('should unregister idle agents', () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    k.unregister('a');
    expect(k.getAgent('a')).toBeUndefined();
  });

  it('should refuse to unregister agents with running processes', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    await k.spawn('a');
    expect(() => k.unregister('a')).toThrow('process(es) still running');
  });

  it('should spawn a process', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const proc = await k.spawn('a');
    expect(proc.state).toBe('running');
    expect(proc.agentName).toBe('a');
    expect(k.getProcess(proc.id)).toBe(proc);
  });

  it('should spawn with custom id', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const proc = await k.spawn('a', { id: 'custom-id' });
    expect(proc.id).toBe('custom-id');
  });

  it('should reject spawning unregistered agent', async () => {
    const k = new Kernel();
    await expect(k.spawn('nope')).rejects.toThrow('not registered');
  });

  it('should enforce maxProcesses', async () => {
    const k = new Kernel({ maxProcesses: 1 });
    k.register(new Agent({ name: 'a' }));
    await k.spawn('a');
    await expect(k.spawn('a')).rejects.toThrow('Process limit');
  });

  it('should pause, resume, terminate', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const p = await k.spawn('a');

    await k.pause(p.id);
    expect(p.state).toBe('paused');

    await k.resume(p.id);
    expect(p.state).toBe('running');

    await k.terminate(p.id);
    expect(p.state).toBe('terminated');
  });

  it('should throw on unknown process id', async () => {
    const k = new Kernel();
    await expect(k.pause('nope')).rejects.toThrow('not found');
    await expect(k.resume('nope')).rejects.toThrow('not found');
    await expect(k.terminate('nope')).rejects.toThrow('not found');
  });

  it('should shutdown all active processes', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }), new Agent({ name: 'b' }));
    const p1 = await k.spawn('a');
    const p2 = await k.spawn('b');
    await k.shutdown();
    expect(p1.state).toBe('terminated');
    expect(p2.state).toBe('terminated');
  });

  it('should query processes by agentName', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }), new Agent({ name: 'b' }));
    await k.spawn('a');
    await k.spawn('a');
    await k.spawn('b');
    expect(k.getProcesses({ agentName: 'a' })).toHaveLength(2);
    expect(k.getProcesses({ agentName: 'b' })).toHaveLength(1);
  });

  it('should query processes by state', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const p1 = await k.spawn('a');
    await k.spawn('a');
    await k.pause(p1.id);
    expect(k.getProcesses({ state: 'paused' as ProcessState })).toHaveLength(1);
    expect(k.getProcesses({ state: 'running' as ProcessState })).toHaveLength(1);
  });

  it('should query active processes (running + paused)', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const p1 = await k.spawn('a');
    const p2 = await k.spawn('a');
    const p3 = await k.spawn('a');
    await k.pause(p1.id);
    await k.terminate(p3.id);
    expect(k.getProcesses({ active: true })).toHaveLength(2);
  });

  it('should produce readable toString', () => {
    const k = new Kernel({ name: 'x' });
    expect(k.toString()).toContain('x');
  });

  // Events

  it('should fire lifecycle events', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.register(new Agent({ name: 'a' }));
    const p = await k.spawn('a');
    await k.pause(p.id);
    await k.resume(p.id);
    await k.terminate(p.id);
    await k.shutdown();

    expect(types).toContain('kernel:started');
    expect(types).toContain('agent:registered');
    expect(types).toContain('process:spawned');
    expect(types).toContain('process:paused');
    expect(types).toContain('process:resumed');
    expect(types).toContain('process:terminated');
    expect(types).toContain('kernel:shutdown');
  });

  it('should support on() and unsubscribe', () => {
    const k = new Kernel();
    const calls: string[] = [];
    const unsub = k.on('test', () => calls.push('hit'));
    k['_emit']('test');
    expect(calls).toHaveLength(1);
    unsub();
    k['_emit']('test');
    expect(calls).toHaveLength(1);
  });

  it('should support onAny()', () => {
    const k = new Kernel();
    const types: string[] = [];
    k.onAny((e) => types.push(e.type));
    k['_emit']('custom:event');
    expect(types).toContain('custom:event');
  });

  it('should swallow event handler errors', () => {
    const k = new Kernel();
    k.on('test', () => { throw new Error('handler crash'); });
    expect(() => k['_emit']('test')).not.toThrow();
  });

  it('should log in debug mode', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const k = new Kernel({ debug: true });
    k['_emit']('test:event', { x: 1 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // Convenience methods

  it('should registerTool via convenience method', () => {
    const k = new Kernel();
    k.registerTool({
      name: 'noop',
      description: 'noop',
      parameters: { type: 'string' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => null,
    });
    expect(k.tools.getTool('noop')).toBeDefined();
  });

  it('should createChannel via convenience method', () => {
    const k = new Kernel();
    k.createChannel({ name: 'ch', type: 'pubsub' });
    expect(k.broker.getChannel('ch')).toBeDefined();
  });
});

// ════════════════════════════════════════════════
// Kernel.execute()
// ════════════════════════════════════════════════

describe('Kernel.execute()', () => {
  it('should execute handler and return result', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'echo', handler: async (ctx) => `echo: ${ctx.input}` }));
    const p = await k.spawn('echo');
    const r = await k.execute(p.id, { task: 'hello' });

    expect(r.output).toBe('echo: hello');
    expect(r.processId).toBe(p.id);
    expect(r.agentName).toBe('echo');
    expect(r.duration).toBeGreaterThanOrEqual(0);
    expect(r.events.length).toBeGreaterThan(0);
  });

  it('should use taskInput.input when provided', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async (ctx) => ctx.input }));
    const p = await k.spawn('a');
    const r = await k.execute(p.id, { task: 'desc', input: { data: 42 } });
    expect(r.output).toEqual({ data: 42 });
  });

  it('should fall back to task string when input is absent', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async (ctx) => ctx.input }));
    const p = await k.spawn('a');
    const r = await k.execute(p.id, { task: 'the-task' });
    expect(r.output).toBe('the-task');
  });

  it('should reject if process is not running', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async () => 'ok' }));
    const p = await k.spawn('a');
    await k.pause(p.id);
    await expect(k.execute(p.id, { task: 'x' })).rejects.toThrow('expected "running"');
  });

  it('should reject if agent has no handler', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a' }));
    const p = await k.spawn('a');
    await expect(k.execute(p.id, { task: 'x' })).rejects.toThrow('no handler');
  });

  it('should crash process on handler error', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async () => { throw new Error('fail'); } }));
    const p = await k.spawn('a');

    await expect(k.execute(p.id, { task: 'x' })).rejects.toThrow('fail');
    expect(p.state).toBe('crashed');
  });

  it('should handle non-Error throws', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async () => { throw 'string-error'; } }));
    const p = await k.spawn('a');

    await expect(k.execute(p.id, { task: 'x' })).rejects.toThrow('string-error');
    expect(p.state).toBe('crashed');
  });

  it('should store lastExecution metadata on success', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async () => 'done' }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'work' });

    const meta = p.getMetadata('lastExecution') as Record<string, unknown>;
    expect(meta.task).toBe('work');
    expect(meta.success).toBe(true);
    expect(typeof meta.duration).toBe('number');
  });

  it('should store lastExecution metadata on failure', async () => {
    const k = new Kernel();
    k.register(new Agent({ name: 'a', handler: async () => { throw new Error('x'); } }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'work' }).catch(() => {});

    const meta = p.getMetadata('lastExecution') as Record<string, unknown>;
    expect(meta.success).toBe(false);
    expect(meta.error).toBe('x');
  });

  it('should emit execution events', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.register(new Agent({ name: 'a', handler: async () => 'ok' }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'x' });

    expect(types).toContain('execution:started');
    expect(types).toContain('execution:completed');
  });

  it('should emit execution:failed on error', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.register(new Agent({ name: 'a', handler: async () => { throw new Error('x'); } }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'x' }).catch(() => {});

    expect(types).toContain('execution:failed');
  });

  it('should allow ctx.emit() for custom events', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.register(new Agent({
      name: 'a',
      handler: async (ctx) => { ctx.emit('custom', { key: 'val' }); return 'ok'; },
    }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'x' });

    expect(types).toContain('agent:custom');
  });
});

// ════════════════════════════════════════════════
// Kernel + Memory Integration
// ════════════════════════════════════════════════

describe('Kernel + Memory', () => {
  it('should provide isolated memory per process', async () => {
    const k = new Kernel();
    k.register(new Agent({
      name: 'a',
      handler: async (ctx) => {
        await ctx.memory.set('id', ctx.processId);
        return await ctx.memory.get('id');
      },
    }));
    const p1 = await k.spawn('a');
    const p2 = await k.spawn('a');
    const r1 = await k.execute(p1.id, { task: 'x' });
    const r2 = await k.execute(p2.id, { task: 'x' });

    expect(r1.output).toBe(p1.id);
    expect(r2.output).toBe(p2.id);
  });

  it('should persist memory across multiple executions', async () => {
    const k = new Kernel();
    k.register(new Agent({
      name: 'counter',
      handler: async (ctx) => {
        const n = ((await ctx.memory.get('n')) as number ?? 0) + 1;
        await ctx.memory.set('n', n);
        return n;
      },
    }));
    const p = await k.spawn('counter');

    expect((await k.execute(p.id, { task: 'x' })).output).toBe(1);
    expect((await k.execute(p.id, { task: 'x' })).output).toBe(2);
    expect((await k.execute(p.id, { task: 'x' })).output).toBe(3);
  });

  it('should clean up memory on terminate (non-persistent)', async () => {
    const k = new Kernel();
    k.register(new Agent({
      name: 'tmp',
      handler: async (ctx) => { await ctx.memory.set('k', 'v'); return 'ok'; },
    }));
    const p = await k.spawn('tmp');
    await k.execute(p.id, { task: 'x' });
    await k.terminate(p.id);

    const mem = k.memory.getAccessor(p.id);
    expect(await mem.get('k')).toBeUndefined();
  });

  it('should preserve memory on terminate when persistent', async () => {
    const k = new Kernel();
    k.register(new Agent({
      name: 'keep',
      memory: { persistent: true },
      handler: async (ctx) => { await ctx.memory.set('k', 'kept'); return 'ok'; },
    }));
    const p = await k.spawn('keep');
    await k.execute(p.id, { task: 'x' });
    await k.terminate(p.id);

    const mem = k.memory.getAccessor(p.id);
    expect(await mem.get('k')).toBe('kept');
  });
});

// ════════════════════════════════════════════════
// Kernel + Tools Integration
// ════════════════════════════════════════════════

describe('Kernel + Tools', () => {
  it('should allow tool invocation via ctx.useTool()', async () => {
    const k = new Kernel();
    k.registerTool({
      name: 'double',
      description: 'doubles',
      parameters: { type: 'number' },
      sideEffects: 'none',
      permission: 'public',
      handler: async (p) => (p as number) * 2,
    });
    k.register(new Agent({
      name: 'a',
      tools: ['double'],
      handler: async (ctx) => ctx.useTool('double', 21),
    }));
    const p = await k.spawn('a');
    const r = await k.execute(p.id, { task: 'x' });
    expect(r.output).toBe(42);
  });

  it('should block undeclared tools', async () => {
    const k = new Kernel();
    k.registerTool({
      name: 'secret',
      description: 's',
      parameters: { type: 'string' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'nope',
    });
    k.register(new Agent({
      name: 'restricted',
      tools: ['allowed-only'],
      handler: async (ctx) => ctx.useTool('secret', {}),
    }));
    const p = await k.spawn('restricted');
    await expect(k.execute(p.id, { task: 'x' })).rejects.toThrow('not allowed');
  });

  it('should allow any tool when tools list is empty', async () => {
    const k = new Kernel();
    k.registerTool({
      name: 'open',
      description: 'o',
      parameters: { type: 'string' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'open-access',
    });
    k.register(new Agent({
      name: 'open-agent',
      handler: async (ctx) => ctx.useTool('open', {}),
    }));
    const p = await k.spawn('open-agent');
    const r = await k.execute(p.id, { task: 'x' });
    expect(r.output).toBe('open-access');
  });

  it('should emit tool events', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.registerTool({
      name: 'noop',
      description: 'n',
      parameters: { type: 'string' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => null,
    });
    k.register(new Agent({
      name: 'a',
      handler: async (ctx) => ctx.useTool('noop', {}),
    }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'x' });

    expect(types).toContain('tool:registered');
    expect(types).toContain('tool:invoked');
    expect(types).toContain('tool:completed');
  });
});

// ════════════════════════════════════════════════
// Kernel + Broker Integration
// ════════════════════════════════════════════════

describe('Kernel + Broker', () => {
  it('should publish messages via ctx.publish()', async () => {
    const k = new Kernel();
    k.createChannel({ name: 'ch', type: 'pubsub' });
    const received: unknown[] = [];
    k.broker.subscribe('ch', 'listener', (m) => received.push(m.data));

    k.register(new Agent({
      name: 'pub',
      handler: async (ctx) => { ctx.publish('ch', { msg: 'hi' }); return 'ok'; },
    }));
    const p = await k.spawn('pub');
    await k.execute(p.id, { task: 'x' });

    expect(received).toEqual([{ msg: 'hi' }]);
  });

  it('should emit message:published event', async () => {
    const types: string[] = [];
    const k = new Kernel({ on: { '*': (e) => types.push(e.type) } });
    k.createChannel({ name: 'ch', type: 'pubsub' });
    k.register(new Agent({
      name: 'a',
      handler: async (ctx) => { ctx.publish('ch', 'data'); return 'ok'; },
    }));
    const p = await k.spawn('a');
    await k.execute(p.id, { task: 'x' });

    expect(types).toContain('message:published');
    expect(types).toContain('channel:created');
  });
});
