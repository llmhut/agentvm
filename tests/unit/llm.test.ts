/**
 * Tests for src/llm/agent.ts — LLM agent factory, agentic loop, API adapters
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { Agent } from '../../src/core/agent';
import { createLLMAgent, createPipeline } from '../../src/llm/agent';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Helpers ──

/** Mock an Anthropic API response (text only, no tool calls) */
function mockAnthropicText(text: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  });
}

/** Mock an Anthropic API response with tool calls followed by a text response */
function mockAnthropicToolThenText(toolName: string, toolArgs: unknown, finalText: string) {
  let callCount = 0;
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      // First call: LLM wants to use a tool
      return {
        ok: true,
        json: async () => ({
          content: [
            { type: 'text', text: 'Let me use a tool.' },
            { type: 'tool_use', id: 'toolu_123', name: toolName, input: toolArgs },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 15, output_tokens: 25 },
        }),
      };
    }
    // Second call: LLM returns final text
    return {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: finalText }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 30, output_tokens: 10 },
      }),
    };
  });
}

/** Mock an OpenAI API response (text only) */
function mockOpenAIText(text: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
  });
}

/** Mock an OpenAI API response with tool calls then text */
function mockOpenAIToolThenText(toolName: string, toolArgs: unknown, finalText: string) {
  let callCount = 0;
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_abc',
                function: { name: toolName, arguments: JSON.stringify(toolArgs) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 15, completion_tokens: 25 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: finalText }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 10 },
      }),
    };
  });
}

// ──────────────────────────────────────────────
// Agent Factory Basics
// ──────────────────────────────────────────────

describe('createLLMAgent', () => {
  it('should create a valid Agent instance', () => {
    const agent = createLLMAgent({
      name: 'test-llm',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'You are helpful.',
    });

    expect(agent).toBeInstanceOf(Agent);
    expect(agent.name).toBe('test-llm');
    expect(agent.handler).toBeDefined();
  });

  it('should auto-generate description from provider/model', () => {
    const agent = createLLMAgent({
      name: 'auto',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
    });
    expect(agent.description).toContain('openai');
    expect(agent.description).toContain('gpt-4o');
  });

  it('should use custom description when provided', () => {
    const agent = createLLMAgent({
      name: 'custom',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      description: 'My custom bot',
    });
    expect(agent.description).toBe('My custom bot');
  });

  it('should pass tools and memory config through', () => {
    const agent = createLLMAgent({
      name: 'configured',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['http_fetch', 'shell_exec'],
      memory: { persistent: true },
    });
    expect(agent.tools).toEqual(['http_fetch', 'shell_exec']);
    expect(agent.memory).toEqual({ persistent: true });
  });
});

// ──────────────────────────────────────────────
// Anthropic — Text Response (no tools)
// ──────────────────────────────────────────────

describe('Anthropic text response', () => {
  it('should call Anthropic API and return text', async () => {
    mockAnthropicText('Hello from Claude!');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'claude-text',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Be helpful.',
      apiKey: 'sk-test-key',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('claude-text');
    const result = await kernel.execute(proc.id, { task: 'Say hello' });

    expect(result.output).toBe('Hello from Claude!');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Verify API was called with correct params
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/v1/messages');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.system).toBe('Be helpful.');
  });

  it('should track token usage in memory', async () => {
    mockAnthropicText('response');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'usage-track',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('usage-track');
    await kernel.execute(proc.id, { task: 'hi' });

    const usage = (await kernel.memory.getAccessor(proc.id).get('__llm_usage')) as {
      inputTokens: number;
      outputTokens: number;
    };
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(20);
  });

  it('should save conversation history in memory', async () => {
    mockAnthropicText('hi back');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'history-test',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('history-test');
    await kernel.execute(proc.id, { task: 'hello' });

    const messages = (await kernel.memory.getAccessor(proc.id).get('__llm_messages')) as Array<{ role: string }>;
    expect(messages).toHaveLength(2); // user + assistant
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should call onBeforeCall and onAfterCall hooks', async () => {
    mockAnthropicText('ok');

    const beforeCalls: unknown[] = [];
    const afterCalls: unknown[] = [];

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'hooks-test',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
      onBeforeCall: (messages) => { beforeCalls.push(messages.length); },
      onAfterCall: (response) => { afterCalls.push(response.stopReason); },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('hooks-test');
    await kernel.execute(proc.id, { task: 'test' });

    expect(beforeCalls).toEqual([1]);
    expect(afterCalls).toEqual(['end_turn']);
  });

  it('should use custom baseUrl', async () => {
    mockAnthropicText('ok');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'custom-url',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
      baseUrl: 'https://my-proxy.example.com',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('custom-url');
    await kernel.execute(proc.id, { task: 'test' });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://my-proxy.example.com/v1/messages');
  });
});

// ──────────────────────────────────────────────
// Anthropic — Tool Call Flow
// ──────────────────────────────────────────────

describe('Anthropic tool call flow', () => {
  it('should execute tools and feed results back to LLM', async () => {
    mockAnthropicToolThenText('uppercase', { text: 'hello' }, 'Result: HELLO');

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'uppercase',
      description: 'Uppercase text',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      sideEffects: 'none',
      permission: 'public',
      handler: async (params) => (params as { text: string }).text.toUpperCase(),
    });

    const agent = createLLMAgent({
      name: 'tool-agent',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Use tools.',
      tools: ['uppercase'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('tool-agent');
    const result = await kernel.execute(proc.id, { task: 'uppercase hello' });

    expect(result.output).toBe('Result: HELLO');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('should handle tool errors gracefully', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            content: [
              { type: 'tool_use', id: 'toolu_err', name: 'failing_tool', input: {} },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I see the tool failed' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 20, output_tokens: 15 },
        }),
      };
    });

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'failing_tool',
      description: 'Always fails',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => { throw new Error('tool broke'); },
    });

    const agent = createLLMAgent({
      name: 'tool-error-agent',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['failing_tool'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('tool-error-agent');
    const result = await kernel.execute(proc.id, { task: 'try tool' });

    expect(result.output).toBe('I see the tool failed');
  });

  it('should call onToolCall hook', async () => {
    mockAnthropicToolThenText('my_tool', { x: 1 }, 'done');

    const toolCalls: Array<{ name: string; args: unknown }> = [];

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'my_tool',
      description: 'test',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'ok',
    });

    const agent = createLLMAgent({
      name: 'hook-tool-agent',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['my_tool'],
      apiKey: 'sk-test',
      onToolCall: (name, args) => { toolCalls.push({ name, args }); },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('hook-tool-agent');
    await kernel.execute(proc.id, { task: 'go' });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('my_tool');
    expect(toolCalls[0].args).toEqual({ x: 1 });
  });

  it('should include tools in Anthropic API body when tools are available', async () => {
    mockAnthropicText('ok');

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'some_tool',
      description: 'A tool',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'ok',
    });

    const agent = createLLMAgent({
      name: 'tools-in-body',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['some_tool'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('tools-in-body');
    await kernel.execute(proc.id, { task: 'test' });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.tools[0].name).toBe('some_tool');
  });
});

// ──────────────────────────────────────────────
// Anthropic — Error Handling
// ──────────────────────────────────────────────

describe('Anthropic error handling', () => {
  it('should throw without API key', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'no-key',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('no-key');
    await expect(kernel.execute(proc.id, { task: 'hi' })).rejects.toThrow('API key required');

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('should throw on non-OK API response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'api-error',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('api-error');
    await expect(kernel.execute(proc.id, { task: 'hi' })).rejects.toThrow('Anthropic API error 429');
  });
});

// ──────────────────────────────────────────────
// Anthropic — Max Turns
// ──────────────────────────────────────────────

describe('Anthropic max turns', () => {
  it('should stop after maxTurns and return fallback message', async () => {
    // Always return a tool call, never a text response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: 'tool_use', id: 'toolu_loop', name: 'echo', input: {} },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
    });

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'echoed',
    });

    const agent = createLLMAgent({
      name: 'max-turn-agent',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['echo'],
      apiKey: 'sk-test',
      maxTurns: 2,
    });

    kernel.register(agent);
    const proc = await kernel.spawn('max-turn-agent');
    const result = await kernel.execute(proc.id, { task: 'loop' });

    expect(result.output).toContain('max turns reached');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────
// OpenAI — Text Response
// ──────────────────────────────────────────────

describe('OpenAI text response', () => {
  it('should call OpenAI API and return text', async () => {
    mockOpenAIText('Hello from GPT!');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'gpt-text',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Be helpful.',
      apiKey: 'sk-oai-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('gpt-text');
    const result = await kernel.execute(proc.id, { task: 'Say hello' });

    expect(result.output).toBe('Hello from GPT!');

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/v1/chat/completions');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('Be helpful.');
  });

  it('should use custom baseUrl for OpenAI', async () => {
    mockOpenAIText('ok');

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'oai-proxy',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
      baseUrl: 'https://my-oai-proxy.example.com',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-proxy');
    await kernel.execute(proc.id, { task: 'test' });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://my-oai-proxy.example.com/v1/chat/completions');
  });
});

// ──────────────────────────────────────────────
// OpenAI — Tool Call Flow
// ──────────────────────────────────────────────

describe('OpenAI tool call flow', () => {
  it('should execute tools and return final response', async () => {
    mockOpenAIToolThenText('add', { a: 1, b: 2 }, 'The sum is 3');

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'add',
      description: 'Add numbers',
      parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
      sideEffects: 'none',
      permission: 'public',
      handler: async (params) => {
        const p = params as { a: number; b: number };
        return p.a + p.b;
      },
    });

    const agent = createLLMAgent({
      name: 'oai-tool',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Use tools.',
      tools: ['add'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-tool');
    const result = await kernel.execute(proc.id, { task: 'add 1 + 2' });

    expect(result.output).toBe('The sum is 3');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('should handle OpenAI tool errors gracefully', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: '',
                tool_calls: [{
                  id: 'call_fail',
                  function: { name: 'bad_tool', arguments: '{}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
            usage: { prompt_tokens: 5, completion_tokens: 5 },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'handled error' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        }),
      };
    });

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'bad_tool',
      description: 'fails',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => { throw new Error('oops'); },
    });

    const agent = createLLMAgent({
      name: 'oai-fail',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
      tools: ['bad_tool'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-fail');
    const result = await kernel.execute(proc.id, { task: 'try' });

    expect(result.output).toBe('handled error');
  });

  it('should include tools in OpenAI API body', async () => {
    mockOpenAIText('ok');

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
      sideEffects: 'read',
      permission: 'public',
      handler: async () => 'results',
    });

    const agent = createLLMAgent({
      name: 'oai-with-tools',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
      tools: ['search'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-with-tools');
    await kernel.execute(proc.id, { task: 'test' });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.tools).toBeDefined();
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('search');
  });

  it('should call onToolCall hook for OpenAI', async () => {
    mockOpenAIToolThenText('my_fn', { val: 42 }, 'done');

    const toolCalls: string[] = [];

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'my_fn',
      description: 'test',
      parameters: { type: 'object' },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'result',
    });

    const agent = createLLMAgent({
      name: 'oai-hook',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
      tools: ['my_fn'],
      apiKey: 'sk-test',
      onToolCall: (name) => { toolCalls.push(name); },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-hook');
    await kernel.execute(proc.id, { task: 'go' });

    expect(toolCalls).toEqual(['my_fn']);
  });
});

// ──────────────────────────────────────────────
// OpenAI — Error Handling
// ──────────────────────────────────────────────

describe('OpenAI error handling', () => {
  it('should throw without API key', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'oai-no-key',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-no-key');
    await expect(kernel.execute(proc.id, { task: 'hi' })).rejects.toThrow('API key required');

    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  });

  it('should throw on non-OK OpenAI response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'oai-500',
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('oai-500');
    await expect(kernel.execute(proc.id, { task: 'hi' })).rejects.toThrow('OpenAI API error 500');
  });
});

// ──────────────────────────────────────────────
// Tool Schema from Memory
// ──────────────────────────────────────────────

describe('Tool schema from memory', () => {
  it('should use injected schemas when available', async () => {
    mockAnthropicText('ok');

    const kernel = new Kernel();
    kernel.registerTool({
      name: 'real_tool',
      description: 'A properly described tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
      sideEffects: 'none',
      permission: 'public',
      handler: async () => 'ok',
    });

    const agent = createLLMAgent({
      name: 'schema-agent',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['real_tool'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('schema-agent');
    await kernel.execute(proc.id, { task: 'test' });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.tools[0].name).toBe('real_tool');
    expect(body.tools[0].description).toBe('A properly described tool');
  });

  it('should use fallback schemas when memory has none', async () => {
    mockAnthropicText('ok');

    const kernel = new Kernel();
    // Don't register any tools — no schemas will be injected
    const agent = createLLMAgent({
      name: 'no-schema',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      tools: ['unknown_tool'],
      apiKey: 'sk-test',
    });

    kernel.register(agent);
    const proc = await kernel.spawn('no-schema');
    await kernel.execute(proc.id, { task: 'test' });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.tools[0].name).toBe('unknown_tool');
    expect(body.tools[0].description).toContain('Tool:');
  });
});

// ──────────────────────────────────────────────
// Pipeline
// ──────────────────────────────────────────────

describe('createPipeline', () => {
  it('should chain agents: output of A → input of B → input of C', async () => {
    const kernel = new Kernel();

    const a = new Agent({ name: 'a', handler: async (ctx) => `A(${ctx.input})` });
    const b = new Agent({ name: 'b', handler: async (ctx) => `B(${ctx.input})` });
    const c = new Agent({ name: 'c', handler: async (ctx) => `C(${ctx.input})` });

    const pipeline = await createPipeline(kernel, [a, b, c]);
    const result = await pipeline('start');

    expect(result).toBe('C(B(A(start)))');
  });

  it('should work with single agent', async () => {
    const kernel = new Kernel();
    const agent = new Agent({ name: 'solo', handler: async (ctx) => `done(${ctx.input})` });

    const pipeline = await createPipeline(kernel, [agent]);
    expect(await pipeline('x')).toBe('done(x)');
  });

  it('should handle non-string intermediate outputs', async () => {
    const kernel = new Kernel();

    const a = new Agent({ name: 'obj-a', handler: async () => ({ value: 42 }) });
    const b = new Agent({ name: 'obj-b', handler: async (ctx) => `got: ${ctx.input}` });

    const pipeline = await createPipeline(kernel, [a, b]);
    const result = await pipeline('start');

    expect(result).toBe('got: [object Object]');
  });
});

// ──────────────────────────────────────────────
// Multi-turn conversation
// ──────────────────────────────────────────────

describe('Multi-turn conversation', () => {
  it('should accumulate history across executions', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: `response ${callCount}` }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      };
    });

    const kernel = new Kernel();
    const agent = createLLMAgent({
      name: 'multi-turn',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'Test',
      apiKey: 'sk-test',
      memory: { persistent: true },
    });

    kernel.register(agent);
    const proc = await kernel.spawn('multi-turn');

    await kernel.execute(proc.id, { task: 'first message' });
    await kernel.execute(proc.id, { task: 'second message' });

    const messages = (await kernel.memory.getAccessor(proc.id).get('__llm_messages')) as Array<{ role: string }>;
    // first user + first assistant + second user + second assistant
    expect(messages).toHaveLength(4);

    // Second API call should have included conversation history
    const secondCallBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(secondCallBody.messages).toHaveLength(3); // first user, first assistant, second user
  });
});
