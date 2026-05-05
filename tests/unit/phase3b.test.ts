/**
 * Tests for: Config System, Checkpointing, Kernel.stats()
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Kernel } from '../../src/core/kernel';
import { Agent } from '../../src/core/agent';
import {
  parseYaml,
  loadConfig,
  validateConfig,
  ConfigValidationError,
} from '../../src/config/loader';
import {
  checkpoint,
  restore,
  readCheckpoint,
} from '../../src/checkpoint/checkpoint';

const tmpDir = `/tmp/agentvm-phase3b-${Date.now()}`;

afterEach(async () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ──────────────────────────────────────────────
// YAML Parser
// ──────────────────────────────────────────────

describe('parseYaml', () => {
  it('should parse simple key-value pairs', () => {
    const result = parseYaml('name: my-app\ndebug: true\ncount: 42') as Record<string, unknown>;
    expect(result.name).toBe('my-app');
    expect(result.debug).toBe(true);
    expect(result.count).toBe(42);
  });

  it('should parse nested objects', () => {
    const yaml = `
memory:
  backend: sqlite
  path: ./data.db
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    const mem = result.memory as Record<string, unknown>;
    expect(mem.backend).toBe('sqlite');
    expect(mem.path).toBe('./data.db');
  });

  it('should parse flow arrays', () => {
    const yaml = 'tools: [http_fetch, json_fetch, shell_exec]';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.tools).toEqual(['http_fetch', 'json_fetch', 'shell_exec']);
  });

  it('should parse block arrays', () => {
    const yaml = `tools:
  - http_fetch
  - json_fetch
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.tools).toEqual(['http_fetch', 'json_fetch']);
  });

  it('should parse flow objects', () => {
    const yaml = 'input: {type: string}';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.input).toEqual({ type: 'string' });
  });

  it('should handle null and booleans', () => {
    const yaml = 'a: null\nb: true\nc: false\nd: ~';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.a).toBeNull();
    expect(result.b).toBe(true);
    expect(result.c).toBe(false);
    expect(result.d).toBeNull();
  });

  it('should handle quoted strings', () => {
    const yaml = `a: "hello world"\nb: 'single quoted'`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.a).toBe('hello world');
    expect(result.b).toBe('single quoted');
  });

  it('should strip comments', () => {
    const yaml = 'name: app # this is a comment\n# full line comment\nport: 3000';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.name).toBe('app');
    expect(result.port).toBe(3000);
  });

  it('should skip blank lines', () => {
    const yaml = 'a: 1\n\n\nb: 2';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  it('should parse deeply nested config', () => {
    const yaml = `
agents:
  researcher:
    description: A research agent
    tools: [http_fetch]
    memory:
      persistent: true
`;
    const result = parseYaml(yaml) as Record<string, unknown>;
    const agents = result.agents as Record<string, Record<string, unknown>>;
    expect(agents.researcher.description).toBe('A research agent');
    expect(agents.researcher.tools).toEqual(['http_fetch']);
    const mem = agents.researcher.memory as Record<string, unknown>;
    expect(mem.persistent).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Config Validation
// ──────────────────────────────────────────────

describe('validateConfig', () => {
  it('should pass valid config', () => {
    const errors = validateConfig({
      name: 'app',
      debug: false,
      maxProcesses: 10,
      memory: { backend: 'memory' },
      agents: { greeter: { description: 'test' } },
      tools: ['http_fetch'],
      channels: { updates: { type: 'pubsub' } },
    });
    expect(errors).toEqual([]);
  });

  it('should reject invalid name type', () => {
    const errors = validateConfig({ name: 42 });
    expect(errors).toContain('`name` must be a string');
  });

  it('should reject invalid debug type', () => {
    const errors = validateConfig({ debug: 'yes' });
    expect(errors).toContain('`debug` must be a boolean');
  });

  it('should reject invalid maxProcesses', () => {
    expect(validateConfig({ maxProcesses: -1 })).toHaveLength(1);
    expect(validateConfig({ maxProcesses: 0 })).toHaveLength(1);
  });

  it('should reject invalid memory backend', () => {
    const errors = validateConfig({ memory: { backend: 'postgres' } });
    expect(errors.some((e) => e.includes('memory.backend'))).toBe(true);
  });

  it('should require path for sqlite backend', () => {
    const errors = validateConfig({ memory: { backend: 'sqlite' } });
    expect(errors.some((e) => e.includes('memory.path'))).toBe(true);
  });

  it('should accept sqlite with path', () => {
    const errors = validateConfig({ memory: { backend: 'sqlite', path: './db.sqlite' } });
    expect(errors).toEqual([]);
  });

  it('should reject non-object agents', () => {
    const errors = validateConfig({ agents: 'invalid' });
    expect(errors).toHaveLength(1);
  });

  it('should reject non-array tools', () => {
    const errors = validateConfig({ tools: 'invalid' });
    expect(errors).toHaveLength(1);
  });

  it('should reject invalid channel type', () => {
    const errors = validateConfig({
      channels: { bad: { type: 'invalid' } },
    });
    expect(errors).toHaveLength(1);
  });

  it('should pass empty config', () => {
    expect(validateConfig({})).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// Config Loader
// ──────────────────────────────────────────────

describe('loadConfig', () => {
  it('should load a valid YAML config', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, 'agentvm.yml');
    fs.writeFileSync(configPath, `
name: test-app
debug: false
memory:
  backend: memory
agents:
  greeter:
    description: A greeting agent
    tools: [http_fetch]
tools:
  - http_fetch
channels:
  updates:
    type: pubsub
    historyLimit: 50
`, 'utf-8');

    const config = loadConfig(configPath);
    expect(config.name).toBe('test-app');
    expect(config.debug).toBe(false);
    expect(config.agents?.greeter?.description).toBe('A greeting agent');
    expect(config.tools).toContain('http_fetch');
    expect(config.channels?.updates?.type).toBe('pubsub');
  });

  it('should throw for missing config file', () => {
    expect(() => loadConfig('/nonexistent/agentvm.yml')).toThrow('not found');
  });

  it('should throw ConfigValidationError for invalid config', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, 'bad.yml');
    fs.writeFileSync(configPath, 'debug: yes_please\n', 'utf-8');

    expect(() => loadConfig(configPath)).toThrow(ConfigValidationError);
  });

  it('should apply env overrides', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, 'env.yml');
    fs.writeFileSync(configPath, `
name: default-name
env:
  name: AGENTVM_NAME
`, 'utf-8');

    process.env.AGENTVM_NAME = 'from-env';
    const config = loadConfig(configPath);
    expect(config.name).toBe('from-env');
    delete process.env.AGENTVM_NAME;
  });
});

// ──────────────────────────────────────────────
// Checkpointing
// ──────────────────────────────────────────────

describe('Checkpoint', () => {
  it('should save and restore a process', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const cpPath = path.join(tmpDir, 'checkpoint.json');

    const kernel = new Kernel();
    const agent = new Agent({
      name: 'counter',
      memory: { persistent: true },
      handler: async (ctx) => {
        const count = ((await ctx.memory.get('count')) as number ?? 0) + 1;
        await ctx.memory.set('count', count);
        return count;
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('counter');

    // Execute twice
    await kernel.execute(proc.id, { task: 'inc' });
    await kernel.execute(proc.id, { task: 'inc' });

    // Checkpoint
    const data = await checkpoint(kernel, proc.id, cpPath);
    expect(data.version).toBe(1);
    expect(data.agentName).toBe('counter');
    expect(data.memory.count).toBe(2);

    // Terminate original
    await kernel.terminate(proc.id);

    // Restore into a new kernel
    const kernel2 = new Kernel();
    kernel2.register(agent);
    const restored = await restore(kernel2, cpPath);

    expect(restored.agentName).toBe('counter');

    // Memory should be restored
    const count = await kernel2.memory.getAccessor(restored.id).get('count');
    expect(count).toBe(2);

    // Can continue executing
    const result = await kernel2.execute(restored.id, { task: 'inc' });
    expect(result.output).toBe(3);
  });

  it('should throw for non-existent process', async () => {
    const kernel = new Kernel();
    await expect(
      checkpoint(kernel, 'nonexistent', '/tmp/cp.json')
    ).rejects.toThrow('not found');
  });

  it('should throw for non-existent checkpoint file', async () => {
    const kernel = new Kernel();
    await expect(
      restore(kernel, '/tmp/nonexistent-checkpoint.json')
    ).rejects.toThrow();
  });

  it('should throw when agent is not registered on restore', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const cpPath = path.join(tmpDir, 'orphan.json');

    const kernel = new Kernel();
    const agent = new Agent({ name: 'temp', handler: async () => 'ok' });
    kernel.register(agent);
    const proc = await kernel.spawn('temp');
    await checkpoint(kernel, proc.id, cpPath);

    // New kernel WITHOUT the agent registered
    const kernel2 = new Kernel();
    await expect(restore(kernel2, cpPath)).rejects.toThrow('not registered');
  });

  it('readCheckpoint should return checkpoint data without restoring', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const cpPath = path.join(tmpDir, 'read-only.json');

    const kernel = new Kernel();
    const agent = new Agent({ name: 'reader', handler: async () => 'ok' });
    kernel.register(agent);
    const proc = await kernel.spawn('reader');
    await checkpoint(kernel, proc.id, cpPath);

    const data = await readCheckpoint(cpPath);
    expect(data.agentName).toBe('reader');
    expect(data.version).toBe(1);
    expect(data.processId).toBe(proc.id);
  });

  it('should preserve process metadata', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const cpPath = path.join(tmpDir, 'meta.json');

    const kernel = new Kernel();
    const agent = new Agent({ name: 'meta-agent', handler: async () => 'ok' });
    kernel.register(agent);
    const proc = await kernel.spawn('meta-agent', {
      metadata: { owner: 'test-user', priority: 'high' },
    });

    await checkpoint(kernel, proc.id, cpPath);
    const data = await readCheckpoint(cpPath);
    expect(data.metadata.owner).toBe('test-user');
    expect(data.metadata.priority).toBe('high');
  });
});

// ──────────────────────────────────────────────
// Kernel.stats()
// ──────────────────────────────────────────────

describe('Kernel.stats()', () => {
  it('should return aggregate stats', async () => {
    const kernel = new Kernel({ name: 'stats-test' });

    const agent = new Agent({
      name: 'worker',
      handler: async (ctx) => {
        await ctx.memory.set('data', 'value');
        return 'done';
      },
    });

    kernel.register(agent);
    kernel.registerTool({
      name: 'dummy',
      description: 'test',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'ok',
    });
    kernel.createChannel({ name: 'ch1', type: 'pubsub' });

    const proc = await kernel.spawn('worker');
    await kernel.execute(proc.id, { task: 'work' });

    const stats = await kernel.stats();
    expect(stats.kernel).toBe('stats-test');
    expect(stats.agents).toBe(1);
    expect(stats.processes.total).toBe(1);
    expect(stats.processes.active).toBe(1);
    expect(stats.processes.byState.running).toBe(1);
    expect(stats.memory.backend).toBe('memory');
    expect(stats.memory.totalEntries).toBeGreaterThan(0);
    expect(stats.tools).toBe(1);
    expect(stats.channels).toBe(1);
    expect(stats.tokens).toBe(0); // no LLM usage
  });

  it('should count tokens from __llm_usage', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'llm-sim',
      handler: async (ctx) => {
        await ctx.memory.set('__llm_usage', {
          inputTokens: 100,
          outputTokens: 50,
        });
        return 'done';
      },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('llm-sim');
    await kernel.execute(proc.id, { task: 'work' });

    const stats = await kernel.stats();
    expect(stats.tokens).toBe(150);
  });

  it('should track terminated and crashed processes', async () => {
    const kernel = new Kernel();
    const agent = new Agent({
      name: 'lifecycle',
      handler: async () => 'ok',
    });

    kernel.register(agent);

    const p1 = await kernel.spawn('lifecycle');
    const p2 = await kernel.spawn('lifecycle');
    const p3 = await kernel.spawn('lifecycle');

    await kernel.terminate(p1.id);
    // p2 stays running
    // p3 stays running

    const stats = await kernel.stats();
    expect(stats.processes.total).toBe(3);
    expect(stats.processes.active).toBe(2);
    expect(stats.processes.byState.terminated).toBe(1);
    expect(stats.processes.byState.running).toBe(2);
  });
});
