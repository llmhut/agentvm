/**
 * Vercel AI SDK Adapter — Use AgentVM tools in AI SDK apps.
 *
 * Converts AgentVM `ToolDefinition` → Vercel AI SDK `tool()` format
 * so you can use AgentVM's tool router, rate limiting, and permission system
 * with any AI SDK agent.
 *
 * @example
 * ```ts
 * import { Kernel, registerBuiltins } from '@llmhut/agentvm';
 * import { toAISDKTools } from '@llmhut/agentvm/adapters/vercel-ai';
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const kernel = new Kernel();
 * registerBuiltins(kernel);
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Fetch the contents of https://example.com',
 *   tools: toAISDKTools(kernel, ['http_fetch']),
 * });
 * ```
 *
 * **Note**: This adapter does NOT depend on `ai` at runtime.
 * It produces plain objects matching the AI SDK tool interface.
 */

import type { Kernel } from '../core/kernel';
import type { ToolDefinition, ToolContext } from '../core/types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * Shape of a Vercel AI SDK tool.
 * Matches the `tool()` helper return type.
 */
export interface AISDKToolShape {
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ──────────────────────────────────────────────
// Tool Adapter
// ──────────────────────────────────────────────

/**
 * Convert a single AgentVM `ToolDefinition` into Vercel AI SDK tool format.
 */
export function toolToAISDK(tool: ToolDefinition, context?: Partial<ToolContext>): AISDKToolShape {
  const ctx: ToolContext = {
    agentName: context?.agentName ?? 'ai-sdk-agent',
    processId: context?.processId ?? 'ai-sdk-process',
    signal: context?.signal ?? new AbortController().signal,
  };

  return {
    description: tool.description,
    parameters: {
      type: (tool.parameters.type as string) ?? 'object',
      properties: (tool.parameters.properties as Record<string, unknown>) ?? {},
      required: tool.parameters.required as string[] | undefined,
    },
    execute: async (args: Record<string, unknown>) => {
      return tool.handler(args, ctx);
    },
  };
}

/**
 * Convert AgentVM tools to a Vercel AI SDK tools object.
 *
 * Returns `Record<string, AISDKToolShape>` which can be passed
 * directly to `generateText({ tools })` or `streamText({ tools })`.
 *
 * @param kernel — The AgentVM kernel
 * @param filter — Optional list of tool names to include (default: all)
 */
export function toAISDKTools(kernel: Kernel, filter?: string[]): Record<string, AISDKToolShape> {
  const allTools = kernel.tools.tools;
  const filtered = filter ? allTools.filter((t) => filter.includes(t.name)) : allTools;

  const result: Record<string, AISDKToolShape> = {};
  for (const tool of filtered) {
    result[tool.name] = toolToAISDK(tool);
  }
  return result;
}

// ──────────────────────────────────────────────
// Middleware Adapter
// ──────────────────────────────────────────────

/**
 * Create an AI SDK middleware-style wrapper that tracks token usage
 * in AgentVM's memory system.
 *
 * @example
 * ```ts
 * const tracker = createUsageTracker(kernel, 'my-session');
 * const result = await generateText({ model, prompt, tools });
 * await tracker.record(result.usage);
 * const total = await tracker.getTotal();
 * ```
 */
export function createUsageTracker(kernel: Kernel, namespace: string) {
  const accessor = kernel.memory.getAccessor(namespace);

  return {
    /** Record token usage from an AI SDK response */
    record: async (usage: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }) => {
      const existing = ((await accessor.get('__llm_usage')) as {
        inputTokens: number;
        outputTokens: number;
      }) ?? { inputTokens: 0, outputTokens: 0 };

      existing.inputTokens += usage.promptTokens ?? 0;
      existing.outputTokens += usage.completionTokens ?? 0;

      await accessor.set('__llm_usage', existing);
    },

    /** Get total token usage */
    getTotal: async () => {
      const usage = ((await accessor.get('__llm_usage')) as {
        inputTokens: number;
        outputTokens: number;
      }) ?? { inputTokens: 0, outputTokens: 0 };

      return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      };
    },

    /** Reset token usage */
    reset: async () => {
      await accessor.set('__llm_usage', { inputTokens: 0, outputTokens: 0 });
    },
  };
}
