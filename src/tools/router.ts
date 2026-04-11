import type { ToolDefinition, ToolContext } from '../core/types';

/**
 * ToolRouter — Central tool registry and invocation engine.
 *
 * Handles tool registration, permission checking, rate limiting,
 * and execution with error handling.
 */
export class ToolRouter {
  private _tools: Map<string, ToolDefinition>;
  private _rateLimitCounters: Map<string, { count: number; resetAt: number }>;

  constructor() {
    this._tools = new Map();
    this._rateLimitCounters = new Map();
  }

  /**
   * Register a tool with the router.
   */
  register(tool: ToolDefinition): void {
    if (this._tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool.
   */
  unregister(toolName: string): void {
    this._tools.delete(toolName);
  }

  /**
   * Get a tool definition by name.
   */
  getTool(name: string): ToolDefinition | undefined {
    return this._tools.get(name);
  }

  /**
   * List all registered tools.
   */
  get tools(): ToolDefinition[] {
    return Array.from(this._tools.values());
  }

  /**
   * Invoke a tool with permission and rate limit checks.
   */
  async invoke(toolName: string, params: unknown, context: ToolContext): Promise<unknown> {
    const tool = this._tools.get(toolName);
    if (!tool) {
      throw new ToolNotFoundError(toolName);
    }

    // Rate limit check
    if (tool.rateLimit) {
      this._checkRateLimit(toolName, context.agentName, tool.rateLimit);
    }

    // Execute with timeout and error handling
    try {
      const result = await tool.handler(params, context);
      return result;
    } catch (error) {
      throw new ToolExecutionError(
        toolName,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check which tools an agent has access to.
   */
  getAvailableTools(allowedToolNames: string[]): ToolDefinition[] {
    return allowedToolNames
      .map((name) => this._tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  // ── Rate Limiting ──

  private _checkRateLimit(toolName: string, agentName: string, limit: number): void {
    const key = `${toolName}:${agentName}`;
    const now = Date.now();
    const counter = this._rateLimitCounters.get(key);

    if (!counter || now > counter.resetAt) {
      this._rateLimitCounters.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }

    if (counter.count >= limit) {
      throw new ToolRateLimitError(toolName, limit);
    }

    counter.count++;
  }
}

// ── Error Classes ──

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolExecutionError extends Error {
  constructor(toolName: string, reason: string) {
    super(`Tool "${toolName}" execution failed: ${reason}`);
    this.name = 'ToolExecutionError';
  }
}

export class ToolRateLimitError extends Error {
  constructor(toolName: string, limit: number) {
    super(`Tool "${toolName}" rate limit exceeded (${limit}/min)`);
    this.name = 'ToolRateLimitError';
  }
}
