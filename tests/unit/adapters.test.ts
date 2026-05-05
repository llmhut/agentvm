/**
 * Tests for Framework Adapters: LangChain, Vercel AI SDK, Generic
 */

import { describe, it, expect } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { registerBuiltins } from '../../src/builtins/tools';

// LangChain adapter
import {
  toolToLangChain,
  toLangChainTools,
  toLangChainMemory,
} from '../../src/adapters/langchain';

// Vercel AI SDK adapter
import {
  toolToAISDK,
  toAISDKTools,
  createUsageTracker,
} from '../../src/adapters/vercel-ai';

// Generic adapter
import {
  toOpenAITools,
  toAnthropicTools,
  createToolExecutor,
  describeTools,
} from '../../src/adapters/generic';

// ── Test helpers ──

function createKernelWithTools() {
  const kernel = new Kernel({ name: 'adapter-test' });

  kernel.registerTool({
    name: 'add',
    description: 'Add two numbers',
    parameters: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
    sideEffects: 'none',
    permission: 'public',
    handler: async (params) => {
      const p = params as { a: number; b: number };
      return p.a + p.b;
    },
  });

  kernel.registerTool({
    name: 'greet',
    description: 'Greet a person',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    sideEffects: 'none',
    permission: 'public',
    handler: async (params) => `Hello, ${(params as { name: string }).name}!`,
  });

  return kernel;
}

// ──────────────────────────────────────────────
// LangChain Adapter — Tools
// ──────────────────────────────────────────────

describe('LangChain tool adapter', () => {
  it('should convert a single tool to LangChain shape', () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('add')!;
    const lcTool = toolToLangChain(tool);

    expect(lcTool.name).toBe('add');
    expect(lcTool.description).toBe('Add two numbers');
    expect(lcTool.schema).toEqual({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    });
    expect(typeof lcTool.func).toBe('function');
  });

  it('should execute the tool and return string result', async () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('add')!;
    const lcTool = toolToLangChain(tool);

    const result = await lcTool.func({ a: 3, b: 7 });
    expect(result).toBe('10'); // JSON stringified number
  });

  it('should return string directly when handler returns string', async () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('greet')!;
    const lcTool = toolToLangChain(tool);

    const result = await lcTool.func({ name: 'World' });
    expect(result).toBe('Hello, World!');
  });

  it('toLangChainTools should convert all tools', () => {
    const kernel = createKernelWithTools();
    const tools = toLangChainTools(kernel);

    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('add');
    expect(tools.map((t) => t.name)).toContain('greet');
  });

  it('toLangChainTools should filter by name', () => {
    const kernel = createKernelWithTools();
    const tools = toLangChainTools(kernel, ['greet']);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('greet');
  });

  it('should accept custom context', () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('add')!;
    const lcTool = toolToLangChain(tool, {
      agentName: 'my-lc-agent',
      processId: 'lc-session-1',
    });

    // Should not throw — context is internal
    expect(lcTool.name).toBe('add');
  });
});

// ──────────────────────────────────────────────
// LangChain Adapter — Memory
// ──────────────────────────────────────────────

describe('LangChain memory adapter', () => {
  it('should create a memory shape with correct variables', () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'test-session');

    expect(memory.memoryVariables).toEqual(['chat_history']);
  });

  it('should save and load context as string', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'session-1');

    await memory.saveContext({ input: 'Hello' }, { output: 'Hi there!' });
    await memory.saveContext({ input: 'How are you?' }, { output: "I'm great!" });

    const vars = await memory.loadMemoryVariables({});
    expect(vars.chat_history).toContain('Human: Hello');
    expect(vars.chat_history).toContain('AI: Hi there!');
    expect(vars.chat_history).toContain('Human: How are you?');
  });

  it('should return array format when configured', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'session-arr', {
      returnFormat: 'array',
    });

    await memory.saveContext({ input: 'Hi' }, { output: 'Hello' });

    const vars = await memory.loadMemoryVariables({});
    const history = vars.chat_history as Array<{ input: string; output: string }>;
    expect(history).toHaveLength(1);
    expect(history[0].input).toBe('Hi');
    expect(history[0].output).toBe('Hello');
  });

  it('should respect maxEntries', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'session-max', {
      maxEntries: 2,
    });

    await memory.saveContext({ input: 'msg1' }, { output: 'r1' });
    await memory.saveContext({ input: 'msg2' }, { output: 'r2' });
    await memory.saveContext({ input: 'msg3' }, { output: 'r3' });

    const vars = await memory.loadMemoryVariables({});
    const content = vars.chat_history as string;
    expect(content).not.toContain('msg1'); // trimmed
    expect(content).toContain('msg2');
    expect(content).toContain('msg3');
  });

  it('should support custom memory key', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'session-key', {
      memoryKey: 'history',
    });

    expect(memory.memoryVariables).toEqual(['history']);

    await memory.saveContext({ input: 'test' }, { output: 'ok' });
    const vars = await memory.loadMemoryVariables({});
    expect(vars.history).toBeDefined();
  });

  it('should clear memory', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'session-clear');

    await memory.saveContext({ input: 'Hi' }, { output: 'Hello' });
    await memory.clear();

    const vars = await memory.loadMemoryVariables({});
    expect(vars.chat_history).toBe(''); // empty string
  });

  it('should return empty on fresh session', async () => {
    const kernel = new Kernel();
    const memory = toLangChainMemory(kernel, 'fresh');

    const vars = await memory.loadMemoryVariables({});
    expect(vars.chat_history).toBe('');
  });
});

// ──────────────────────────────────────────────
// Vercel AI SDK Adapter
// ──────────────────────────────────────────────

describe('Vercel AI SDK tool adapter', () => {
  it('should convert a single tool to AI SDK shape', () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('add')!;
    const aiTool = toolToAISDK(tool);

    expect(aiTool.description).toBe('Add two numbers');
    expect(aiTool.parameters.type).toBe('object');
    expect(aiTool.parameters.properties).toHaveProperty('a');
    expect(typeof aiTool.execute).toBe('function');
  });

  it('should execute tool and return raw result', async () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('add')!;
    const aiTool = toolToAISDK(tool);

    const result = await aiTool.execute({ a: 5, b: 3 });
    expect(result).toBe(8); // raw number, not stringified
  });

  it('toAISDKTools should return a Record keyed by tool name', () => {
    const kernel = createKernelWithTools();
    const tools = toAISDKTools(kernel);

    expect(Object.keys(tools)).toContain('add');
    expect(Object.keys(tools)).toContain('greet');
    expect(tools.add.description).toBe('Add two numbers');
  });

  it('toAISDKTools should filter by name', () => {
    const kernel = createKernelWithTools();
    const tools = toAISDKTools(kernel, ['add']);

    expect(Object.keys(tools)).toEqual(['add']);
  });

  it('should accept custom context', async () => {
    const kernel = createKernelWithTools();
    const tool = kernel.tools.getTool('greet')!;
    const aiTool = toolToAISDK(tool, { agentName: 'custom' });

    const result = await aiTool.execute({ name: 'Test' });
    expect(result).toBe('Hello, Test!');
  });
});

describe('Vercel AI SDK usage tracker', () => {
  it('should record and retrieve token usage', async () => {
    const kernel = new Kernel();
    const tracker = createUsageTracker(kernel, 'track-session');

    await tracker.record({ promptTokens: 100, completionTokens: 50 });
    await tracker.record({ promptTokens: 200, completionTokens: 80 });

    const total = await tracker.getTotal();
    expect(total.inputTokens).toBe(300);
    expect(total.outputTokens).toBe(130);
    expect(total.totalTokens).toBe(430);
  });

  it('should reset usage', async () => {
    const kernel = new Kernel();
    const tracker = createUsageTracker(kernel, 'reset-session');

    await tracker.record({ promptTokens: 100, completionTokens: 50 });
    await tracker.reset();

    const total = await tracker.getTotal();
    expect(total.totalTokens).toBe(0);
  });

  it('should return zeros on fresh session', async () => {
    const kernel = new Kernel();
    const tracker = createUsageTracker(kernel, 'fresh-session');

    const total = await tracker.getTotal();
    expect(total.totalTokens).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Generic Adapter — OpenAI Format
// ──────────────────────────────────────────────

describe('OpenAI tool format', () => {
  it('should convert tools to OpenAI format', () => {
    const kernel = createKernelWithTools();
    const tools = toOpenAITools(kernel);

    expect(tools).toHaveLength(2);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('add');
    expect(tools[0].function.description).toBe('Add two numbers');
    expect(tools[0].function.parameters).toEqual({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    });
  });

  it('should filter by name', () => {
    const kernel = createKernelWithTools();
    const tools = toOpenAITools(kernel, ['greet']);

    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('greet');
  });
});

// ──────────────────────────────────────────────
// Generic Adapter — Anthropic Format
// ──────────────────────────────────────────────

describe('Anthropic tool format', () => {
  it('should convert tools to Anthropic format', () => {
    const kernel = createKernelWithTools();
    const tools = toAnthropicTools(kernel);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('add');
    expect(tools[0].description).toBe('Add two numbers');
    expect(tools[0].input_schema.type).toBe('object');
  });

  it('should filter by name', () => {
    const kernel = createKernelWithTools();
    const tools = toAnthropicTools(kernel, ['add']);

    expect(tools).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// Generic Adapter — Tool Executor
// ──────────────────────────────────────────────

describe('createToolExecutor', () => {
  it('should execute tools by name', async () => {
    const kernel = createKernelWithTools();
    const executor = createToolExecutor(kernel);

    const result = await executor('add', { a: 10, b: 20 });
    expect(result).toBe(30);
  });

  it('should throw for unknown tools', async () => {
    const kernel = createKernelWithTools();
    const executor = createToolExecutor(kernel);

    await expect(executor('nonexistent')).rejects.toThrow('not found');
  });

  it('should work with custom context', async () => {
    const kernel = createKernelWithTools();
    const executor = createToolExecutor(kernel, { agentName: 'my-agent' });

    const result = await executor('greet', { name: 'Agent' });
    expect(result).toBe('Hello, Agent!');
  });

  it('should default to empty args', async () => {
    const kernel = new Kernel();
    kernel.registerTool({
      name: 'noop',
      description: 'Does nothing',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'done',
    });

    const executor = createToolExecutor(kernel);
    const result = await executor('noop');
    expect(result).toBe('done');
  });
});

// ──────────────────────────────────────────────
// Generic Adapter — describeTools
// ──────────────────────────────────────────────

describe('describeTools', () => {
  it('should describe all tools', () => {
    const kernel = createKernelWithTools();
    const desc = describeTools(kernel);

    expect(desc).toContain('add(a, b)');
    expect(desc).toContain('greet(name)');
    expect(desc).toContain('Add two numbers');
    expect(desc).toContain('[public, none]');
  });

  it('should handle empty kernel', () => {
    const kernel = new Kernel();
    expect(describeTools(kernel)).toBe('No tools registered.');
  });
});

// ──────────────────────────────────────────────
// Integration: built-in tools through adapters
// ──────────────────────────────────────────────

describe('Adapter integration with builtins', () => {
  it('should convert all built-in tools to OpenAI format', () => {
    const kernel = new Kernel();
    registerBuiltins(kernel);

    const tools = toOpenAITools(kernel);
    expect(tools.length).toBe(6);
    expect(tools.map((t) => t.function.name)).toContain('http_fetch');
    expect(tools.map((t) => t.function.name)).toContain('shell_exec');
  });

  it('should convert all built-in tools to AI SDK format', () => {
    const kernel = new Kernel();
    registerBuiltins(kernel);

    const tools = toAISDKTools(kernel);
    expect(Object.keys(tools)).toHaveLength(6);
    expect(tools.http_fetch).toBeDefined();
    expect(tools.wait).toBeDefined();
  });

  it('should convert all built-in tools to LangChain format', () => {
    const kernel = new Kernel();
    registerBuiltins(kernel);

    const tools = toLangChainTools(kernel);
    expect(tools).toHaveLength(6);
  });
});
