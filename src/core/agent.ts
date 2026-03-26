import type { AgentConfig, AgentContract, AgentHandler, MemoryConfig } from './types';

/**
 * Agent — A definition of an autonomous agent.
 *
 * An Agent is a blueprint, not a running instance. When you spawn an agent,
 * the kernel creates a Process from this definition.
 *
 * @example
 * ```ts
 * const researcher = new Agent({
 *   name: 'researcher',
 *   description: 'Searches the web and summarizes findings',
 *   tools: ['web_search', 'summarize'],
 *   memory: { persistent: true },
 *   handler: async (ctx) => {
 *     const results = await ctx.useTool('web_search', { query: ctx.input });
 *     return ctx.useTool('summarize', { text: results });
 *   },
 * });
 * ```
 */
export class Agent {
  readonly name: string;
  readonly description: string;
  readonly tools: string[];
  readonly memory: MemoryConfig;
  readonly contract?: AgentContract;
  readonly handler?: AgentHandler;

  constructor(config: AgentConfig) {
    if (!config.name || config.name.trim() === '') {
      throw new Error('Agent name is required');
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(config.name)) {
      throw new Error(
        `Invalid agent name "${config.name}". Must start with a letter and contain only letters, numbers, hyphens, and underscores.`
      );
    }

    this.name = config.name;
    this.description = config.description ?? '';
    this.tools = config.tools ?? [];
    this.memory = config.memory ?? {};
    this.contract = config.contract;
    this.handler = config.handler;
  }

  /**
   * Returns a serializable representation of this agent.
   */
  toJSON(): AgentConfig {
    return {
      name: this.name,
      description: this.description,
      tools: this.tools,
      memory: this.memory,
      contract: this.contract,
    };
  }

  toString(): string {
    return `Agent(${this.name})`;
  }
}
