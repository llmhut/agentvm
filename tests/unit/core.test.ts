import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { Agent } from '../../src/core/agent';

// ── Agent Tests ──

describe('Agent', () => {
  it('should create an agent with required fields', () => {
    const agent = new Agent({ name: 'test-agent' });
    expect(agent.name).toBe('test-agent');
    expect(agent.description).toBe('');
    expect(agent.tools).toEqual([]);
  });

  it('should create an agent with all fields', () => {
    const agent = new Agent({
      name: 'researcher',
      description: 'Researches topics',
      tools: ['web_search', 'summarize'],
      memory: { persistent: true },
    });
    expect(agent.name).toBe('researcher');
    expect(agent.tools).toEqual(['web_search', 'summarize']);
    expect(agent.memory.persistent).toBe(true);
  });

  it('should reject empty agent names', () => {
    expect(() => new Agent({ name: '' })).toThrow('Agent name is required');
  });

  it('should reject invalid agent names', () => {
    expect(() => new Agent({ name: '123invalid' })).toThrow('Invalid agent name');
    expect(() => new Agent({ name: 'has spaces' })).toThrow('Invalid agent name');
  });

  it('should serialize to JSON', () => {
    const agent = new Agent({ name: 'test', description: 'A test agent' });
    const json = agent.toJSON();
    expect(json.name).toBe('test');
    expect(json.description).toBe('A test agent');
  });
});

// ── Kernel Tests ──

describe('Kernel', () => {
  it('should create a kernel with default config', () => {
    const kernel = new Kernel();
    expect(kernel.name).toBe('agentvm');
  });

  it('should create a kernel with custom name', () => {
    const kernel = new Kernel({ name: 'my-app' });
    expect(kernel.name).toBe('my-app');
  });

  it('should have memory, tools, and broker subsystems', () => {
    const kernel = new Kernel();
    expect(kernel.memory).toBeDefined();
    expect(kernel.tools).toBeDefined();
    expect(kernel.broker).toBeDefined();
  });

  // Agent Registration

  it('should register an agent', () => {
    const kernel = new Kernel();
    const agent = new Agent({ name: 'test' });
    kernel.register(agent);
    expect(kernel.getAgent('test')).toBe(agent);
  });

  it('should register multiple agents', () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'a' }), new Agent({ name: 'b' }));
    expect(kernel.agents.length).toBe(2);
  });

  it('should reject duplicate agent registration', () => {
    const kernel = new Kernel();
    const agent = new Agent({ name: 'test' });
    kernel.register(agent);
    expect(() => kernel.register(agent)).toThrow('already registered');
  });

  it('should unregister an agent', () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    kernel.unregister('test');
    expect(kernel.getAgent('test')).toBeUndefined();
  });

  // Process Lifecycle

  it('should spawn a process', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');
    expect(process.state).toBe('running');
    expect(process.agentName).toBe('test');
  });

  it('should fail to spawn unregistered agent', async () => {
    const kernel = new Kernel();
    await expect(kernel.spawn('nonexistent')).rejects.toThrow('not registered');
  });

  it('should pause and resume a process', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');

    await kernel.pause(process.id);
    expect(process.state).toBe('paused');

    await kernel.resume(process.id);
    expect(process.state).toBe('running');
  });

  it('should terminate a process', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');

    await kernel.terminate(process.id);
    expect(process.state).toBe('terminated');
  });

  it('should enforce process limits', async () => {
    const kernel = new Kernel({ maxProcesses: 2 });
    kernel.register(new Agent({ name: 'test' }));

    await kernel.spawn('test');
    await kernel.spawn('test');
    await expect(kernel.spawn('test')).rejects.toThrow('Process limit reached');
  });

  it('should shutdown all processes', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'a' }), new Agent({ name: 'b' }));

    const p1 = await kernel.spawn('a');
    const p2 = await kernel.spawn('b');

    await kernel.shutdown();
    expect(p1.state).toBe('terminated');
    expect(p2.state).toBe('terminated');
  });

  // Events

  it('should emit events on lifecycle changes', async () => {
    const events: string[] = [];
    const kernel = new Kernel({
      on: { '*': (e) => events.push(e.type) },
    });
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');
    await kernel.terminate(process.id);

    expect(events).toContain('kernel:started');
    expect(events).toContain('agent:registered');
    expect(events).toContain('process:spawned');
    expect(events).toContain('process:terminated');
  });
});

// ── Execution Tests ──

describe('Kernel.execute()', () => {
  it('should execute an agent handler and return result', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'greeter',
      handler: async (ctx) => `Hello, ${ctx.input}!`,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('greeter');
    const result = await kernel.execute(proc.id, { task: 'World' });

    expect(result.output).toBe('Hello, World!');
    expect(result.agentName).toBe('greeter');
    expect(result.processId).toBe(proc.id);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should pass input from taskInput.input when provided', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'echo',
      handler: async (ctx) => ctx.input,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('echo');
    const result = await kernel.execute(proc.id, {
      task: 'describe task',
      input: { data: [1, 2, 3] },
    });

    expect(result.output).toEqual({ data: [1, 2, 3] });
  });

  it('should fall back to task string as input when input is not provided', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'echo',
      handler: async (ctx) => ctx.input,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('echo');
    const result = await kernel.execute(proc.id, { task: 'the task string' });

    expect(result.output).toBe('the task string');
  });

  it('should fail if process is not running', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test', handler: async () => 'ok' }));
    const proc = await kernel.spawn('test');

    await kernel.pause(proc.id);
    await expect(kernel.execute(proc.id, { task: 'x' })).rejects.toThrow('expected "running"');
  });

  it('should fail if agent has no handler', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'no-handler' }));
    const proc = await kernel.spawn('no-handler');

    await expect(kernel.execute(proc.id, { task: 'x' })).rejects.toThrow('no handler');
  });

  it('should crash the process on handler error', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'crasher',
      handler: async () => { throw new Error('boom'); },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('crasher');

    await expect(kernel.execute(proc.id, { task: 'x' })).rejects.toThrow('boom');
    expect(proc.state).toBe('crashed');
  });

  it('should store lastExecution metadata on success', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'worker',
      handler: async () => 'done',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('worker');
    await kernel.execute(proc.id, { task: 'do work' });

    const meta = proc.getMetadata('lastExecution') as Record<string, unknown>;
    expect(meta.task).toBe('do work');
    expect(meta.success).toBe(true);
    expect(meta.duration).toBeGreaterThanOrEqual(0);
  });

  it('should emit execution events', async () => {
    const events: string[] = [];
    const kernel = new Kernel({ on: { '*': (e) => events.push(e.type) } });
    const agent = new Agent({
      name: 'worker',
      handler: async () => 'done',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('worker');
    await kernel.execute(proc.id, { task: 'x' });

    expect(events).toContain('execution:started');
    expect(events).toContain('execution:completed');
  });
});

// ── Memory Integration Tests ──

describe('Kernel + Memory Integration', () => {
  it('should provide isolated memory to each process', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'memo',
      handler: async (ctx) => {
        await ctx.memory.set('secret', `${ctx.agentName}-${ctx.processId}`);
        return await ctx.memory.get('secret');
      },
    });

    kernel.register(agent);
    const p1 = await kernel.spawn('memo');
    const p2 = await kernel.spawn('memo');

    const r1 = await kernel.execute(p1.id, { task: 'go' });
    const r2 = await kernel.execute(p2.id, { task: 'go' });

    expect(r1.output).toContain(p1.id);
    expect(r2.output).toContain(p2.id);
    expect(r1.output).not.toBe(r2.output);
  });

  it('should clean up memory on terminate (non-persistent)', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'temp',
      handler: async (ctx) => {
        await ctx.memory.set('key', 'value');
        return 'ok';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('temp');
    await kernel.execute(proc.id, { task: 'store' });

    // Memory exists before terminate
    const mem = kernel.memory.getAccessor(proc.id);
    expect(await mem.get('key')).toBe('value');

    await kernel.terminate(proc.id);

    // Memory cleaned up after terminate
    const freshMem = kernel.memory.getAccessor(proc.id);
    expect(await freshMem.get('key')).toBeUndefined();
  });

  it('should preserve memory on terminate when persistent', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'persist',
      memory: { persistent: true },
      handler: async (ctx) => {
        await ctx.memory.set('key', 'preserved');
        return 'ok';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('persist');
    await kernel.execute(proc.id, { task: 'store' });
    await kernel.terminate(proc.id);

    // Memory still exists
    const mem = kernel.memory.getAccessor(proc.id);
    expect(await mem.get('key')).toBe('preserved');
  });
});

// ── Tool Integration Tests ──

describe('Kernel + Tool Integration', () => {
  it('should allow agent to call registered tool via context', async () => {
    const kernel = new Kernel();

    kernel.registerTool({
      name: 'multiply',
      description: 'Multiplies two numbers',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async (params) => {
        const p = params as { a: number; b: number };
        return p.a * p.b;
      },
    });

    const agent = new Agent({
      name: 'calculator',
      tools: ['multiply'],
      handler: async (ctx) => {
        return await ctx.useTool('multiply', { a: 6, b: 7 });
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('calculator');
    const result = await kernel.execute(proc.id, { task: 'multiply' });

    expect(result.output).toBe(42);
  });

  it('should reject tool usage if agent does not declare it', async () => {
    const kernel = new Kernel();

    kernel.registerTool({
      name: 'secret-tool',
      description: 'Restricted',
      parameters: { type: 'object' },
      sideEffects: 'write',
      permission: 'admin',
      handler: async () => 'secret',
    });

    const agent = new Agent({
      name: 'restricted',
      tools: ['allowed-tool'],
      handler: async (ctx) => {
        return await ctx.useTool('secret-tool', {});
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('restricted');

    await expect(kernel.execute(proc.id, { task: 'x' })).rejects.toThrow('not allowed');
  });

  it('should allow any tool when agent declares no tool restrictions', async () => {
    const kernel = new Kernel();

    kernel.registerTool({
      name: 'any-tool',
      description: 'Open tool',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'open-access',
    });

    const agent = new Agent({
      name: 'open',
      tools: [], // empty = no restrictions
      handler: async (ctx) => {
        return await ctx.useTool('any-tool', {});
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('open');
    const result = await kernel.execute(proc.id, { task: 'x' });

    expect(result.output).toBe('open-access');
  });

  it('should emit tool events during execution', async () => {
    const events: string[] = [];
    const kernel = new Kernel({ on: { '*': (e) => events.push(e.type) } });

    kernel.registerTool({
      name: 'echo',
      description: 'Echoes input',
      parameters: { type: 'string' },
      sideEffects: 'none',
      permission: 'public',
      handler: async (params) => params,
    });

    const agent = new Agent({
      name: 'tooluser',
      handler: async (ctx) => ctx.useTool('echo', 'hello'),
    });

    kernel.register(agent);
    const proc = await kernel.spawn('tooluser');
    await kernel.execute(proc.id, { task: 'x' });

    expect(events).toContain('tool:invoked');
    expect(events).toContain('tool:completed');
  });
});

// ── Broker Integration Tests ──

describe('Kernel + Broker Integration', () => {
  it('should allow agent to publish messages via context', async () => {
    const kernel = new Kernel();
    kernel.createChannel({ name: 'updates', type: 'pubsub' });

    const received: unknown[] = [];
    kernel.broker.subscribe('updates', 'listener', (msg) => {
      received.push(msg.data);
    });

    const agent = new Agent({
      name: 'publisher',
      handler: async (ctx) => {
        ctx.publish('updates', { finding: 'AI is cool' });
        return 'published';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('publisher');
    await kernel.execute(proc.id, { task: 'research' });

    expect(received).toEqual([{ finding: 'AI is cool' }]);
  });
});

// ── Process Tests ──

describe('Process', () => {
  it('should track lifecycle events', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');

    expect(process.events.length).toBeGreaterThan(0);
    expect(process.events[0].type).toBe('process:started');
  });

  it('should store and retrieve metadata', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test', {
      metadata: { role: 'researcher' },
    });

    expect(process.getMetadata('role')).toBe('researcher');
    process.setMetadata('status', 'active');
    expect(process.getMetadata('status')).toBe('active');
  });

  it('should provide process info', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');

    const info = process.info;
    expect(info.agentName).toBe('test');
    expect(info.state).toBe('running');
    expect(info.createdAt).toBeInstanceOf(Date);
  });
});
