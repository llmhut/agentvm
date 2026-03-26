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
    expect(agent.description).toBe('Researches topics');
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
    expect(kernel.name).toBe('agentkernel');
  });

  it('should create a kernel with custom name', () => {
    const kernel = new Kernel({ name: 'my-app' });
    expect(kernel.name).toBe('my-app');
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
    const a1 = new Agent({ name: 'agent-1' });
    const a2 = new Agent({ name: 'agent-2' });
    kernel.register(a1, a2);
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
    kernel.register(new Agent({ name: 'a' }));
    kernel.register(new Agent({ name: 'b' }));

    const p1 = await kernel.spawn('a');
    const p2 = await kernel.spawn('b');

    await kernel.shutdown();
    expect(p1.state).toBe('terminated');
    expect(p2.state).toBe('terminated');
  });

  it('should query processes by agent name', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'a' }));
    kernel.register(new Agent({ name: 'b' }));

    await kernel.spawn('a');
    await kernel.spawn('a');
    await kernel.spawn('b');

    const aProcesses = kernel.getProcesses({ agentName: 'a' });
    expect(aProcesses.length).toBe(2);
  });

  // Events

  it('should emit events on lifecycle changes', async () => {
    const events: string[] = [];
    const kernel = new Kernel({
      on: {
        '*': (e) => events.push(e.type),
      },
    });
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');
    await kernel.terminate(process.id);

    expect(events).toContain('kernel:started');
    expect(events).toContain('agent:registered');
    expect(events).toContain('process:spawned');
    expect(events).toContain('process:terminated');
  });

  it('should return unsubscribe function from on()', () => {
    const kernel = new Kernel();
    const handler = vi.fn();
    const unsub = kernel.on('test', handler);
    expect(typeof unsub).toBe('function');
    unsub(); // Should not throw
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

  it('should reject invalid state transitions', async () => {
    const kernel = new Kernel();
    kernel.register(new Agent({ name: 'test' }));
    const process = await kernel.spawn('test');

    // Can't resume a running process
    expect(() => kernel.resume(process.id)).rejects.toThrow();
  });
});
