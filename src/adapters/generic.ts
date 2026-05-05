/**
 * Generic Adapter — Framework-agnostic helpers for integrating AgentVM
 * with any AI framework, HTTP server, or custom runtime.
 *
 * Provides:
 * - `toOpenAITools()` — Convert to OpenAI function-calling format (works with most frameworks)
 * - `toAnthropicTools()` — Convert to Anthropic tool format
 * - `toMCPServer()` — Expose AgentVM tools as an MCP server (stdio transport)
 * - `createToolExecutor()` — Generic tool executor that handles lookup + invoke
 *
 * @example
 * ```ts
 * import { Kernel, registerBuiltins } from '@llmhut/agentvm';
 * import { toOpenAITools, createToolExecutor } from '@llmhut/agentvm/adapters/generic';
 *
 * const kernel = new Kernel();
 * registerBuiltins(kernel);
 *
 * // Get tools in OpenAI format for any API call
 * const tools = toOpenAITools(kernel);
 *
 * // Execute tool calls from model responses
 * const executor = createToolExecutor(kernel);
 * const result = await executor('http_fetch', { url: 'https://example.com' });
 * ```
 */

import type { Kernel } from '../core/kernel';
import type { ToolContext } from '../core/types';

// ──────────────────────────────────────────────
// OpenAI Format
// ──────────────────────────────────────────────

export interface OpenAIToolShape {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert AgentVM tools to OpenAI function-calling format.
 *
 * This format is the most universal — it works with:
 * - OpenAI API directly
 * - LiteLLM
 * - Ollama (function calling mode)
 * - Most AI frameworks that accept OpenAI-format tools
 */
export function toOpenAITools(kernel: Kernel, filter?: string[]): OpenAIToolShape[] {
  const allTools = kernel.tools.tools;
  const filtered = filter ? allTools.filter((t) => filter.includes(t.name)) : allTools;

  return filtered.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.parameters.type ?? 'object',
        properties: tool.parameters.properties ?? {},
        required: tool.parameters.required ?? [],
      },
    },
  }));
}

// ──────────────────────────────────────────────
// Anthropic Format
// ──────────────────────────────────────────────

export interface AnthropicToolShape {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Convert AgentVM tools to Anthropic tool format.
 */
export function toAnthropicTools(kernel: Kernel, filter?: string[]): AnthropicToolShape[] {
  const allTools = kernel.tools.tools;
  const filtered = filter ? allTools.filter((t) => filter.includes(t.name)) : allTools;

  return filtered.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: tool.parameters.type ?? 'object',
      properties: tool.parameters.properties ?? {},
      required: tool.parameters.required ?? [],
    },
  }));
}

// ──────────────────────────────────────────────
// Tool Executor
// ──────────────────────────────────────────────

/**
 * Create a generic tool executor function.
 *
 * Handles tool lookup, permission context, and invocation.
 * Useful for wiring up tool calls from any model response.
 *
 * @example
 * ```ts
 * const executor = createToolExecutor(kernel);
 *
 * // Process tool calls from a model response
 * for (const call of response.tool_calls) {
 *   const result = await executor(call.function.name, JSON.parse(call.function.arguments));
 *   // Feed result back to model...
 * }
 * ```
 */
export function createToolExecutor(
  kernel: Kernel,
  context?: Partial<ToolContext>,
): (toolName: string, args?: Record<string, unknown>) => Promise<unknown> {
  const ctx: ToolContext = {
    agentName: context?.agentName ?? 'external-agent',
    processId: context?.processId ?? 'external-process',
    signal: context?.signal ?? new AbortController().signal,
  };

  return async (toolName: string, args?: Record<string, unknown>) => {
    const tool = kernel.tools.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in AgentVM kernel`);
    }
    return tool.handler(args ?? {}, ctx);
  };
}

// ──────────────────────────────────────────────
// MCP Server (expose AgentVM tools as MCP)
// ──────────────────────────────────────────────

/**
 * Expose AgentVM tools as a JSON-RPC 2.0 MCP server over stdio.
 *
 * This lets other MCP clients (Claude Desktop, Cursor, etc.)
 * use any tool registered in your AgentVM kernel.
 *
 * @example
 * ```ts
 * import { Kernel, registerBuiltins } from '@llmhut/agentvm';
 * import { serveMCP } from '@llmhut/agentvm/adapters/generic';
 *
 * const kernel = new Kernel();
 * registerBuiltins(kernel);
 * serveMCP(kernel); // starts listening on stdin/stdout
 * ```
 */
export async function serveMCP(kernel: Kernel): Promise<void> {
  const readline = await import('node:readline');

  const rl = readline.createInterface({ input: process.stdin });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: { id?: string | number; method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }

    // Notifications (no id) — don't respond
    if (msg.id === undefined) return;

    try {
      if (msg.method === 'initialize') {
        respond(msg.id, {
          capabilities: { tools: {} },
          serverInfo: { name: 'agentvm', version: '0.3.0' },
          protocolVersion: '2024-11-05',
        });
      } else if (msg.method === 'tools/list') {
        const tools = kernel.tools.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: {
            type: t.parameters.type ?? 'object',
            properties: t.parameters.properties ?? {},
            required: t.parameters.required ?? [],
          },
        }));
        respond(msg.id, { tools });
      } else if (msg.method === 'tools/call') {
        const toolName = msg.params?.name as string;
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;

        const tool = kernel.tools.getTool(toolName);
        if (!tool) {
          respondError(msg.id, -32601, `Tool not found: ${toolName}`);
          return;
        }

        const ctx: ToolContext = {
          agentName: 'mcp-client',
          processId: 'mcp-server',
          signal: new AbortController().signal,
        };

        const result = await tool.handler(args, ctx);
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        respond(msg.id, { content: [{ type: 'text', text }] });
      } else if (msg.method === 'resources/list') {
        respond(msg.id, { resources: [] });
      } else {
        respondError(msg.id, -32601, `Unknown method: ${msg.method}`);
      }
    } catch (error) {
      respondError(msg.id, -32603, (error as Error).message);
    }
  });

  function respond(id: string | number, result: unknown): void {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  }

  function respondError(id: string | number, code: number, message: string): void {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  }
}

// ──────────────────────────────────────────────
// Inspect / Debug
// ──────────────────────────────────────────────

/**
 * Get a human-readable summary of all tools in the kernel.
 * Useful for debugging and documentation.
 */
export function describeTools(kernel: Kernel): string {
  const tools = kernel.tools.tools;
  if (tools.length === 0) return 'No tools registered.';

  return tools
    .map((t) => {
      const params = Object.keys((t.parameters.properties as Record<string, unknown>) ?? {});
      const paramStr = params.length > 0 ? `(${params.join(', ')})` : '()';
      return `${t.name}${paramStr} — ${t.description} [${t.permission}, ${t.sideEffects}]`;
    })
    .join('\n');
}
