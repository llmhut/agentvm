/**
 * LangChain.js Adapter — Use AgentVM tools and memory in LangChain apps.
 *
 * Two integration points:
 *
 * 1. **Tools**: Convert AgentVM `ToolDefinition` → LangChain `DynamicStructuredTool`
 *    so LangChain agents can use any tool registered with the AgentVM kernel.
 *
 * 2. **Memory**: Use AgentVM's `MemoryBus` as a LangChain `BaseMemory` backend,
 *    so conversation history persists via AgentVM's pluggable backends (SQLite, etc).
 *
 * @example
 * ```ts
 * import { Kernel, registerBuiltins } from '@llmhut/agentvm';
 * import { toLangChainTools, toLangChainMemory } from '@llmhut/agentvm/adapters/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
 *
 * const kernel = new Kernel();
 * registerBuiltins(kernel);
 *
 * // Convert AgentVM tools → LangChain tools
 * const tools = toLangChainTools(kernel);
 *
 * // Use AgentVM memory as LangChain memory
 * const memory = toLangChainMemory(kernel, 'my-agent-session');
 *
 * // Use in a LangChain agent
 * const llm = new ChatOpenAI({ model: 'gpt-4o' });
 * const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
 * const executor = new AgentExecutor({ agent, tools, memory });
 * ```
 *
 * **Note**: This adapter does NOT depend on `langchain` at runtime.
 * It produces plain objects that conform to LangChain's interfaces.
 * If you have `@langchain/core` installed, the types will match natively.
 */

import type { Kernel } from '../core/kernel';
import type { ToolDefinition, ToolContext } from '../core/types';

// ──────────────────────────────────────────────
// Tool Adapter
// ──────────────────────────────────────────────

/**
 * Shape of a LangChain-compatible tool.
 * Matches `DynamicStructuredTool` constructor input.
 */
export interface LangChainToolShape {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  func: (input: Record<string, unknown>) => Promise<string>;
}

/**
 * Convert an AgentVM `ToolDefinition` into a LangChain-compatible tool shape.
 *
 * If you have `@langchain/core` installed, you can pass these directly
 * to `new DynamicStructuredTool(shape)`.
 */
export function toolToLangChain(
  tool: ToolDefinition,
  context?: Partial<ToolContext>,
): LangChainToolShape {
  const ctx: ToolContext = {
    agentName: context?.agentName ?? 'langchain-agent',
    processId: context?.processId ?? 'langchain-process',
    signal: context?.signal ?? new AbortController().signal,
  };

  return {
    name: tool.name,
    description: tool.description,
    schema: parametersToJsonSchema(tool.parameters as unknown as Record<string, unknown>),
    func: async (input: Record<string, unknown>) => {
      const result = await tool.handler(input, ctx);
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
  };
}

/**
 * Convert all registered AgentVM tools to LangChain-compatible tool shapes.
 *
 * @param kernel — The AgentVM kernel
 * @param filter — Optional list of tool names to include (default: all)
 */
export function toLangChainTools(kernel: Kernel, filter?: string[]): LangChainToolShape[] {
  const allTools = kernel.tools.tools;
  const filtered = filter ? allTools.filter((t) => filter.includes(t.name)) : allTools;

  return filtered.map((tool) => toolToLangChain(tool));
}

// ──────────────────────────────────────────────
// Memory Adapter
// ──────────────────────────────────────────────

/**
 * Shape of a LangChain-compatible memory object.
 * Matches `BaseMemory` interface.
 */
export interface LangChainMemoryShape {
  /** Memory variables returned to the chain */
  memoryVariables: string[];
  /** Load memory variables */
  loadMemoryVariables: (values: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Save context after chain execution */
  saveContext: (
    inputValues: Record<string, unknown>,
    outputValues: Record<string, unknown>,
  ) => Promise<void>;
  /** Clear memory */
  clear: () => Promise<void>;
}

/**
 * Create a LangChain-compatible memory object backed by AgentVM's MemoryBus.
 *
 * Stores conversation history as an array of `{ input, output }` pairs.
 *
 * @param kernel — The AgentVM kernel
 * @param namespace — Memory namespace (typically a session or process ID)
 * @param options — Configuration
 */
export function toLangChainMemory(
  kernel: Kernel,
  namespace: string,
  options?: {
    /** Key name for the memory variable (default: 'chat_history') */
    memoryKey?: string;
    /** Maximum number of history entries to keep (default: unlimited) */
    maxEntries?: number;
    /** Return messages as formatted string vs array (default: 'string') */
    returnFormat?: 'string' | 'array';
  },
): LangChainMemoryShape {
  const memoryKey = options?.memoryKey ?? 'chat_history';
  const maxEntries = options?.maxEntries;
  const returnFormat = options?.returnFormat ?? 'string';
  const accessor = kernel.memory.getAccessor(namespace);

  return {
    memoryVariables: [memoryKey],

    loadMemoryVariables: async () => {
      const history =
        ((await accessor.get('__lc_history')) as Array<{ input: string; output: string }>) ?? [];

      if (returnFormat === 'array') {
        return { [memoryKey]: history };
      }

      // Format as string
      const formatted = history
        .map((entry) => `Human: ${entry.input}\nAI: ${entry.output}`)
        .join('\n');
      return { [memoryKey]: formatted };
    },

    saveContext: async (inputValues, outputValues) => {
      const history =
        ((await accessor.get('__lc_history')) as Array<{ input: string; output: string }>) ?? [];

      const inputStr = Object.values(inputValues).join(' ');
      const outputStr = Object.values(outputValues).join(' ');
      history.push({ input: inputStr, output: outputStr });

      // Trim to maxEntries if set
      if (maxEntries && history.length > maxEntries) {
        history.splice(0, history.length - maxEntries);
      }

      await accessor.set('__lc_history', history);
    },

    clear: async () => {
      await accessor.delete('__lc_history');
    },
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Convert AgentVM SchemaDefinition to standard JSON Schema (for LangChain/Zod compat).
 */
function parametersToJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: schema.type ?? 'object',
    properties: schema.properties ?? {},
    required: schema.required ?? [],
  };
}
