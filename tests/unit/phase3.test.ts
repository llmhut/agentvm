/**
 * Tests for Phase 3: Memory backends, Contract enforcement, Resource tracking
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Kernel } from '../../src/core/kernel';
import { Agent } from '../../src/core/agent';
import { MemoryBus } from '../../src/memory/bus';
import { InMemoryBackend } from '../../src/memory/backends/memory';
import { SqliteBackend } from '../../src/memory/backends/sqlite';
import {
  validateSchema,
  validateInput,
  validateOutput,
  ContractValidationError,
} from '../../src/core/contracts';

// ──────────────────────────────────────────────
// InMemoryBackend
// ──────────────────────────────────────────────

describe('InMemoryBackend', () => {
  it('should implement the MemoryBackend interface', () => {
    const backend = new InMemoryBackend();
    expect(backend.name).toBe('memory');
    expect(typeof backend.get).toBe('function');
    expect(typeof backend.set).toBe('function');
    expect(typeof backend.delete).toBe('function');
    expect(typeof backend.list).toBe('function');
    expect(typeof backend.clear).toBe('function');
    expect(typeof backend.deleteNamespace).toBe('function');
    expect(typeof backend.stats).toBe('function');
    expect(typeof backend.close).toBe('function');
  });

  it('should get/set values in namespaces', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns1', 'key1', 'value1');
    await backend.set('ns2', 'key1', 'value2');

    expect(await backend.get('ns1', 'key1')).toBe('value1');
    expect(await backend.get('ns2', 'key1')).toBe('value2');
    expect(await backend.get('ns1', 'missing')).toBeUndefined();
  });

  it('should delete keys', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns', 'k', 'v');
    expect(await backend.delete('ns', 'k')).toBe(true);
    expect(await backend.delete('ns', 'k')).toBe(false);
    expect(await backend.get('ns', 'k')).toBeUndefined();
  });

  it('should list keys with optional prefix', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns', 'user:1', 'alice');
    await backend.set('ns', 'user:2', 'bob');
    await backend.set('ns', 'config:theme', 'dark');

    expect(await backend.list('ns')).toHaveLength(3);
    expect(await backend.list('ns', 'user:')).toEqual(['user:1', 'user:2']);
    expect(await backend.list('ns', 'config:')).toEqual(['config:theme']);
  });

  it('should clear a namespace', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns', 'a', 1);
    await backend.set('ns', 'b', 2);
    await backend.clear('ns');
    expect(await backend.list('ns')).toEqual([]);
  });

  it('should delete entire namespace', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns1', 'a', 1);
    await backend.set('ns2', 'b', 2);
    await backend.deleteNamespace('ns1');

    const stats = await backend.stats();
    expect(stats.namespaces).toBe(1);
  });

  it('should report stats', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns1', 'a', 1);
    await backend.set('ns1', 'b', 2);
    await backend.set('ns2', 'c', 3);

    const stats = await backend.stats();
    expect(stats.backend).toBe('memory');
    expect(stats.namespaces).toBe(2);
    expect(stats.totalEntries).toBe(3);
  });

  it('should support statsSync', () => {
    const backend = new InMemoryBackend();
    const stats = backend.statsSync();
    expect(stats.namespaces).toBe(0);
    expect(stats.totalEntries).toBe(0);
  });

  it('close should clear everything', async () => {
    const backend = new InMemoryBackend();
    await backend.set('ns', 'k', 'v');
    await backend.close();
    const stats = await backend.stats();
    expect(stats.totalEntries).toBe(0);
  });
});

// ──────────────────────────────────────────────
// SqliteBackend
// ──────────────────────────────────────────────

describe('SqliteBackend', () => {
  const testDir = '/tmp/agentvm-sqlite-test-' + Date.now();
  const dbPath = path.join(testDir, 'test.db');

  afterEach(async () => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('should create an in-memory database', async () => {
    const backend = await SqliteBackend.create(':memory:');
    expect(backend.name).toBe('sqlite');

    await backend.set('ns', 'key', 'value');
    expect(await backend.get('ns', 'key')).toBe('value');

    await backend.close();
  });

  it('should create with null path (in-memory)', async () => {
    const backend = await SqliteBackend.create(null);
    await backend.set('ns', 'k', { nested: true });
    expect(await backend.get('ns', 'k')).toEqual({ nested: true });
    await backend.close();
  });

  it('should get/set/delete values', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns1', 'name', 'Alice');
    await backend.set('ns1', 'age', 30);
    await backend.set('ns2', 'name', 'Bob');

    expect(await backend.get('ns1', 'name')).toBe('Alice');
    expect(await backend.get('ns1', 'age')).toBe(30);
    expect(await backend.get('ns2', 'name')).toBe('Bob');
    expect(await backend.get('ns1', 'missing')).toBeUndefined();

    expect(await backend.delete('ns1', 'name')).toBe(true);
    expect(await backend.delete('ns1', 'name')).toBe(false);
    expect(await backend.get('ns1', 'name')).toBeUndefined();

    await backend.close();
  });

  it('should handle complex JSON values', async () => {
    const backend = await SqliteBackend.create(':memory:');

    const complex = {
      messages: [{ role: 'user', content: 'hello' }],
      settings: { temperature: 0.7 },
      tags: ['ai', 'agent'],
    };

    await backend.set('ns', 'data', complex);
    expect(await backend.get('ns', 'data')).toEqual(complex);

    await backend.close();
  });

  it('should list keys with prefix', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns', 'user:1', 'a');
    await backend.set('ns', 'user:2', 'b');
    await backend.set('ns', 'config:x', 'c');

    const allKeys = await backend.list('ns');
    expect(allKeys).toHaveLength(3);

    const userKeys = await backend.list('ns', 'user:');
    expect(userKeys).toEqual(['user:1', 'user:2']);

    await backend.close();
  });

  it('should clear a namespace', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns1', 'a', 1);
    await backend.set('ns1', 'b', 2);
    await backend.set('ns2', 'c', 3);

    await backend.clear('ns1');
    expect(await backend.list('ns1')).toEqual([]);
    expect(await backend.list('ns2')).toEqual(['c']);

    await backend.close();
  });

  it('should delete a namespace', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns1', 'x', 1);
    await backend.deleteNamespace('ns1');
    expect(await backend.list('ns1')).toEqual([]);

    await backend.close();
  });

  it('should report stats', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns1', 'a', 1);
    await backend.set('ns2', 'b', 2);

    const stats = await backend.stats();
    expect(stats.backend).toBe('sqlite');
    expect(stats.namespaces).toBe(2);
    expect(stats.totalEntries).toBe(2);

    await backend.close();
  });

  it('should persist to file and reload', async () => {
    fs.mkdirSync(testDir, { recursive: true });

    // Write data
    const backend1 = await SqliteBackend.create(dbPath);
    await backend1.set('ns', 'persistent-key', 'persistent-value');
    await backend1.flush();
    await backend1.close();

    // Reload
    const backend2 = await SqliteBackend.create(dbPath);
    expect(await backend2.get('ns', 'persistent-key')).toBe('persistent-value');
    await backend2.close();
  });

  it('should upsert on duplicate key', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns', 'key', 'v1');
    await backend.set('ns', 'key', 'v2');
    expect(await backend.get('ns', 'key')).toBe('v2');

    await backend.close();
  });

  it('should handle special characters in keys and values', async () => {
    const backend = await SqliteBackend.create(':memory:');

    await backend.set('ns', "key'with'quotes", "value'with'quotes");
    expect(await backend.get('ns', "key'with'quotes")).toBe("value'with'quotes");

    await backend.close();
  });
});

// ──────────────────────────────────────────────
// MemoryBus with backends
// ──────────────────────────────────────────────

describe('MemoryBus with pluggable backends', () => {
  it('should default to InMemoryBackend', () => {
    const bus = new MemoryBus();
    expect(bus.backend.name).toBe('memory');
  });

  it('should accept a custom backend', async () => {
    const backend = await SqliteBackend.create(':memory:');
    const bus = new MemoryBus(backend);
    expect(bus.backend.name).toBe('sqlite');

    const accessor = bus.getAccessor('test');
    await accessor.set('key', 'value');
    expect(await accessor.get('key')).toBe('value');

    await bus.close();
  });

  it('should work with statsAsync', async () => {
    const bus = new MemoryBus();
    const accessor = bus.getAccessor('ns');
    await accessor.set('k', 'v');

    const stats = await bus.statsAsync();
    expect(stats.backend).toBe('memory');
    expect(stats.namespaces).toBe(1);
    expect(stats.totalEntries).toBe(1);
  });

  it('should expose backend property', () => {
    const bus = new MemoryBus();
    expect(bus.backend).toBeInstanceOf(InMemoryBackend);
  });
});

// ──────────────────────────────────────────────
// Kernel with SQLite backend
// ──────────────────────────────────────────────

describe('Kernel with SQLite backend', () => {
  it('should work with SQLite memory backend', async () => {
    const backend = await SqliteBackend.create(':memory:');
    const kernel = new Kernel({ memoryBackend: backend });

    const agent = new Agent({
      name: 'persistent-agent',
      memory: { persistent: true },
      handler: async (ctx) => {
        const count = ((await ctx.memory.get('count')) as number ?? 0) + 1;
        await ctx.memory.set('count', count);
        return `count=${count}`;
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('persistent-agent');

    const r1 = await kernel.execute(proc.id, { task: 'inc' });
    expect(r1.output).toBe('count=1');

    const r2 = await kernel.execute(proc.id, { task: 'inc' });
    expect(r2.output).toBe('count=2');

    await backend.close();
  });
});

// ──────────────────────────────────────────────
// Contract Validation — validateSchema
// ──────────────────────────────────────────────

describe('validateSchema', () => {
  it('should validate string type', () => {
    expect(validateSchema('hello', { type: 'string' })).toEqual([]);
    expect(validateSchema(42, { type: 'string' })).toHaveLength(1);
    expect(validateSchema(null, { type: 'string' })).toHaveLength(1);
    expect(validateSchema(undefined, { type: 'string' })).toHaveLength(1);
  });

  it('should validate number type', () => {
    expect(validateSchema(42, { type: 'number' })).toEqual([]);
    expect(validateSchema('42', { type: 'number' })).toHaveLength(1);
  });

  it('should validate boolean type', () => {
    expect(validateSchema(true, { type: 'boolean' })).toEqual([]);
    expect(validateSchema(1, { type: 'boolean' })).toHaveLength(1);
  });

  it('should validate object type', () => {
    expect(validateSchema({}, { type: 'object' })).toEqual([]);
    expect(validateSchema('not-obj', { type: 'object' })).toHaveLength(1);
  });

  it('should validate object properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        age: { type: 'number' as const },
      },
    };

    expect(validateSchema({ name: 'Alice', age: 30 }, schema)).toEqual([]);
    expect(validateSchema({ name: 'Alice', age: 'thirty' }, schema)).toHaveLength(1);
  });

  it('should validate required fields', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
      },
      required: ['name'],
    };

    expect(validateSchema({ name: 'Alice' }, schema)).toEqual([]);
    expect(validateSchema({}, schema)).toHaveLength(1);
    expect(validateSchema({ age: 30 }, schema)).toHaveLength(1);
  });

  it('should validate array type', () => {
    expect(validateSchema([1, 2, 3], { type: 'array' })).toEqual([]);
    expect(validateSchema('not-array', { type: 'array' })).toHaveLength(1);
  });

  it('should validate array items', () => {
    const schema = {
      type: 'array' as const,
      items: { type: 'number' as const },
    };

    expect(validateSchema([1, 2, 3], schema)).toEqual([]);
    expect(validateSchema([1, 'two', 3], schema)).toHaveLength(1);
  });

  it('should include path in violation messages', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
          },
        },
      },
    };

    const violations = validateSchema({ user: { name: 42 } }, schema);
    expect(violations[0]).toContain('user');
    expect(violations[0]).toContain('name');
  });
});

// ──────────────────────────────────────────────
// Contract Validation — validateInput / validateOutput
// ──────────────────────────────────────────────

describe('validateInput / validateOutput', () => {
  it('should pass when no contract schema is defined', () => {
    expect(() => validateInput('agent', {}, 'anything')).not.toThrow();
    expect(() => validateOutput('agent', {}, 'anything')).not.toThrow();
  });

  it('should pass valid input', () => {
    expect(() =>
      validateInput('agent', { input: { type: 'string' } }, 'hello')
    ).not.toThrow();
  });

  it('should throw ContractValidationError for invalid input', () => {
    expect(() =>
      validateInput('agent', { input: { type: 'number' } }, 'not-a-number')
    ).toThrow(ContractValidationError);
  });

  it('should throw ContractValidationError for invalid output', () => {
    expect(() =>
      validateOutput('agent', { output: { type: 'string' } }, 42)
    ).toThrow(ContractValidationError);
  });

  it('ContractValidationError should contain details', () => {
    try {
      validateInput('my-agent', { input: { type: 'number' } }, 'bad');
      expect.unreachable();
    } catch (e) {
      const err = e as ContractValidationError;
      expect(err.agentName).toBe('my-agent');
      expect(err.phase).toBe('input');
      expect(err.violations).toHaveLength(1);
      expect(err.message).toContain('my-agent');
      expect(err.message).toContain('input');
    }
  });
});

// ──────────────────────────────────────────────
// Kernel contract enforcement
// ──────────────────────────────────────────────

describe('Kernel contract enforcement', () => {
  it('should validate input against agent contract', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'typed-agent',
      contract: {
        input: { type: 'number' },
      },
      handler: async (ctx) => ctx.input,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('typed-agent');

    // Valid input
    const r = await kernel.execute(proc.id, { task: 'test', input: 42 });
    expect(r.output).toBe(42);
  });

  it('should reject invalid input', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'strict-agent',
      contract: {
        input: { type: 'number' },
      },
      handler: async (ctx) => ctx.input,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('strict-agent');

    await expect(
      kernel.execute(proc.id, { task: 'test', input: 'not-a-number' })
    ).rejects.toThrow(ContractValidationError);
  });

  it('should validate output against agent contract', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'output-check',
      contract: {
        output: { type: 'string' },
      },
      handler: async () => 42, // Returns number, contract expects string
    });

    kernel.register(agent);
    const proc = await kernel.spawn('output-check');

    await expect(
      kernel.execute(proc.id, { task: 'test' })
    ).rejects.toThrow(ContractValidationError);
  });

  it('should emit SLA latency warning when exceeded', async () => {
    const events: unknown[] = [];
    const kernel = new Kernel({
      on: {
        'contract:sla:latency': (e) => events.push(e.data),
      },
    });

    const agent = new Agent({
      name: 'slow-agent',
      contract: {
        maxLatency: 1, // 1ms — will definitely be exceeded
      },
      handler: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'done';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('slow-agent');
    await kernel.execute(proc.id, { task: 'test' });

    expect(events).toHaveLength(1);
    expect((events[0] as Record<string, unknown>).agentName).toBe('slow-agent');
  });

  it('should skip validation when no contract defined', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'no-contract',
      handler: async (ctx) => ctx.input,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('no-contract');
    const r = await kernel.execute(proc.id, { task: 'test', input: 'anything' });
    expect(r.output).toBe('anything');
  });
});

// ──────────────────────────────────────────────
// Resource tracking
// ──────────────────────────────────────────────

describe('Resource tracking in ExecutionResult', () => {
  it('should surface tokensUsed when __llm_usage is in memory', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'token-agent',
      handler: async (ctx) => {
        await ctx.memory.set('__llm_usage', { inputTokens: 100, outputTokens: 50 });
        return 'done';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('token-agent');
    const result = await kernel.execute(proc.id, { task: 'test' });

    expect(result.tokensUsed).toBe(150);
  });

  it('should have undefined tokensUsed when no usage data', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'no-token-agent',
      handler: async () => 'done',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('no-token-agent');
    const result = await kernel.execute(proc.id, { task: 'test' });

    expect(result.tokensUsed).toBeUndefined();
  });
});
