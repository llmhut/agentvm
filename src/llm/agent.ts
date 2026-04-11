/**
 * LLM Agent — Create AI agents that use language models with AgentVM's tool loop.
 *
 * Provides a `createLLMAgent()` factory that wires up Anthropic or OpenAI
 * models with AgentVM's tool system, memory, and messaging.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { createLLMAgent } from '@llmhut/agentvm/llm';
 *
 * const kernel = new Kernel();
 *
 * // Register tools the agent can use
 * kernel.registerTool(httpFetchTool);
 *
 * const researcher = createLLMAgent({
 *   name: 'researcher',
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 *   systemPrompt: 'You are a research assistant. Use the http_fetch tool to gather information.',
 *   tools: ['http_fetch'],
 *   memory: { persistent: true },
 *   maxTurns: 10,
 * });
 *
 * kernel.register(researcher);
 * const proc = await kernel.spawn('researcher');
 * const result = await kernel.execute(proc.id, { task: 'Find the latest AI news' });
 * ```
 */

import { Agent } from '../core/agent';
import type { AgentConfig, ExecutionContext } from '../core/types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface LLMAgentConfig {
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** Model identifier */
  model: string;
  /** System prompt that defines the agent's behavior */
  systemPrompt: string;
  /** Tools this agent can use (must be registered with the kernel) */
  tools?: string[];
  /** Memory configuration */
  memory?: { persistent?: boolean };
  /** Maximum agentic loop turns (default: 10) */
  maxTurns?: number;
  /** Maximum tokens per response (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0) */
  temperature?: number;
  /** API key (falls back to env vars ANTHROPIC_API_KEY / OPENAI_API_KEY) */
  apiKey?: string;
  /** Base URL override for the API */
  baseUrl?: string;
  /** Hook called before each LLM call with the messages array */
  onBeforeCall?: (messages: LLMMessage[]) => void | Promise<void>;
  /** Hook called after each LLM response */
  onAfterCall?: (response: LLMResponse) => void | Promise<void>;
  /** Hook called when a tool is invoked */
  onToolCall?: (toolName: string, args: unknown) => void | Promise<void>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LLMContentBlock[];
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  content: string;
  toolCalls: { id: string; name: string; args: unknown }[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
}

// ──────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────

/**
 * Create an LLM-powered agent.
 *
 * The agent automatically runs a tool-use loop:
 * 1. Send the task + conversation history to the LLM
 * 2. If the LLM calls tools, execute them via AgentVM's ToolRouter
 * 3. Feed tool results back to the LLM
 * 4. Repeat until the LLM produces a final text response or maxTurns is reached
 */
export function createLLMAgent(config: LLMAgentConfig): Agent {
  const maxTurns = config.maxTurns ?? 10;
  const maxTokens = config.maxTokens ?? 4096;
  const temperature = config.temperature ?? 0;

  const agentConfig: AgentConfig = {
    name: config.name,
    description: config.description ?? `LLM agent using ${config.provider}/${config.model}`,
    tools: config.tools,
    memory: config.memory,
    handler: async (ctx: ExecutionContext) => {
      // Load conversation history from memory (for multi-turn)
      const history = ((await ctx.memory.get('__llm_messages')) as LLMMessage[] | undefined) ?? [];

      // Build the user message from the task input
      const userMessage: LLMMessage = {
        role: 'user',
        content: typeof ctx.input === 'string' ? ctx.input : JSON.stringify(ctx.input),
      };
      history.push(userMessage);

      // Get available tool definitions from the kernel
      // (the context only exposes useTool, so we pass tool schemas to the LLM)
      const toolSchemas = await getToolSchemasFromMemory(ctx, config.tools ?? []);

      // Agentic loop
      let turns = 0;
      let finalResponse = '';

      while (turns < maxTurns) {
        turns++;
        ctx.emit('llm:call', { turn: turns, messageCount: history.length });

        if (config.onBeforeCall) {
          await config.onBeforeCall(history);
        }

        // Call the LLM
        const response =
          config.provider === 'anthropic'
            ? await callAnthropic(config, history, toolSchemas, maxTokens, temperature)
            : await callOpenAI(config, history, toolSchemas, maxTokens, temperature);

        if (config.onAfterCall) {
          await config.onAfterCall(response);
        }

        ctx.emit('llm:response', {
          turn: turns,
          stopReason: response.stopReason,
          toolCalls: response.toolCalls.length,
          usage: response.usage,
        });

        // Track total token usage in memory
        const totalUsage = ((await ctx.memory.get('__llm_usage')) as {
          inputTokens: number;
          outputTokens: number;
        }) ?? { inputTokens: 0, outputTokens: 0 };
        totalUsage.inputTokens += response.usage.inputTokens;
        totalUsage.outputTokens += response.usage.outputTokens;
        await ctx.memory.set('__llm_usage', totalUsage);

        // If no tool calls, we're done
        if (response.toolCalls.length === 0) {
          finalResponse = response.content;

          // Add assistant response to history
          history.push({ role: 'assistant', content: response.content });
          break;
        }

        // Process tool calls
        if (config.provider === 'anthropic') {
          // Anthropic format: assistant message with content blocks
          const assistantBlocks: LLMContentBlock[] = [];
          if (response.content) {
            assistantBlocks.push({ type: 'text', text: response.content });
          }
          for (const tc of response.toolCalls) {
            assistantBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.args,
            });
          }
          history.push({ role: 'assistant', content: assistantBlocks });

          // Execute tools and build result blocks
          const resultBlocks: LLMContentBlock[] = [];
          for (const tc of response.toolCalls) {
            if (config.onToolCall) {
              await config.onToolCall(tc.name, tc.args);
            }
            ctx.emit('tool:call', { name: tc.name, args: tc.args });

            try {
              const result = await ctx.useTool(tc.name, tc.args);
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: typeof result === 'string' ? result : JSON.stringify(result),
              });
            } catch (error) {
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: `Error: ${(error as Error).message}`,
                is_error: true,
              });
            }
          }
          history.push({ role: 'user', content: resultBlocks });
        } else {
          // OpenAI format: assistant message with tool_calls, then tool messages
          history.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args),
              },
            })),
          });

          for (const tc of response.toolCalls) {
            if (config.onToolCall) {
              await config.onToolCall(tc.name, tc.args);
            }
            ctx.emit('tool:call', { name: tc.name, args: tc.args });

            try {
              const result = await ctx.useTool(tc.name, tc.args);
              history.push({
                role: 'tool',
                content: typeof result === 'string' ? result : JSON.stringify(result),
                tool_call_id: tc.id,
              });
            } catch (error) {
              history.push({
                role: 'tool',
                content: `Error: ${(error as Error).message}`,
                tool_call_id: tc.id,
              });
            }
          }
        }
      }

      if (turns >= maxTurns && !finalResponse) {
        finalResponse = '[AgentVM: max turns reached without final response]';
      }

      // Save conversation history
      await ctx.memory.set('__llm_messages', history);

      return finalResponse;
    },
  };

  return new Agent(agentConfig);
}

// ──────────────────────────────────────────────
// Anthropic API Adapter
// ──────────────────────────────────────────────

async function callAnthropic(
  config: LLMAgentConfig,
  messages: LLMMessage[],
  tools: ToolSchema[],
  maxTokens: number,
  temperature: number,
): Promise<LLMResponse> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Anthropic API key required. Set ANTHROPIC_API_KEY env var or pass apiKey in config.',
    );
  }

  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com';

  // Convert messages to Anthropic format
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    messages: anthropicMessages,
  };

  // Add system prompt
  body.system = config.systemPrompt;

  // Add tools if available
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  // Parse response
  let content = '';
  const toolCalls: { id: string; name: string; args: unknown }[] = [];

  for (const block of data.content) {
    if (block.type === 'text') {
      content += block.text ?? '';
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id!,
        name: block.name!,
        args: block.input,
      });
    }
  }

  return {
    content,
    toolCalls,
    stopReason: data.stop_reason,
    usage: {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    },
  };
}

// ──────────────────────────────────────────────
// OpenAI API Adapter
// ──────────────────────────────────────────────

async function callOpenAI(
  config: LLMAgentConfig,
  messages: LLMMessage[],
  tools: ToolSchema[],
  maxTokens: number,
  temperature: number,
): Promise<LLMResponse> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OpenAI API key required. Set OPENAI_API_KEY env var or pass apiKey in config.',
    );
  }

  const baseUrl = config.baseUrl ?? 'https://api.openai.com';

  // Build messages with system prompt first
  const openaiMessages = [
    { role: 'system', content: config.systemPrompt },
    ...messages.map((m) => {
      if (m.tool_calls) {
        return { role: m.role, content: m.content || null, tool_calls: m.tool_calls };
      }
      if (m.tool_call_id) {
        return { role: m.role, content: m.content, tool_call_id: m.tool_call_id };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
  };

  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason: string;
    }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = data.choices[0];
  const toolCalls: { id: string; name: string; args: unknown }[] = [];

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      });
    }
  }

  return {
    content: choice.message.content ?? '',
    toolCalls,
    stopReason: choice.finish_reason,
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    },
  };
}

// ──────────────────────────────────────────────
// Tool Schema Helpers
// ──────────────────────────────────────────────

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Extract tool schemas from process memory.
 *
 * The kernel injects `__tool_schemas` into process memory at spawn time
 * with full schema definitions from the ToolRouter.
 */
async function getToolSchemasFromMemory(
  ctx: ExecutionContext,
  toolNames: string[],
): Promise<ToolSchema[]> {
  const schemas = (await ctx.memory.get('__tool_schemas')) as ToolSchema[] | undefined;
  if (schemas && schemas.length > 0) {
    return schemas;
  }

  // Fallback: minimal schemas from tool names
  return toolNames.map((name) => ({
    name,
    description: `Tool: ${name}`,
    parameters: { type: 'object', properties: {} },
  }));
}

// ──────────────────────────────────────────────
// Pipeline Helper
// ──────────────────────────────────────────────

/**
 * Create a multi-agent pipeline that chains agents sequentially.
 *
 * Each agent's output becomes the next agent's input.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { createLLMAgent, createPipeline } from '@llmhut/agentvm/llm';
 *
 * const researcher = createLLMAgent({ ... });
 * const writer = createLLMAgent({ ... });
 * const editor = createLLMAgent({ ... });
 *
 * const kernel = new Kernel();
 * const pipeline = createPipeline(kernel, [researcher, writer, editor]);
 * const result = await pipeline('Write about AI trends');
 * ```
 */
export async function createPipeline(
  kernel: {
    register: (...agents: Agent[]) => void;
    spawn: (name: string) => Promise<{ id: string }>;
    execute: (id: string, task: { task: string; input?: unknown }) => Promise<{ output: unknown }>;
  },
  agents: Agent[],
): Promise<(input: string) => Promise<unknown>> {
  // Register all agents
  kernel.register(...agents);

  return async (input: string) => {
    let currentInput: unknown = input;

    for (const agent of agents) {
      const proc = await kernel.spawn(agent.name);
      const result = await kernel.execute(proc.id, {
        task: typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput),
        input: currentInput,
      });
      currentInput = result.output;
    }

    return currentInput;
  };
}
