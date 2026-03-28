import type { Agent } from './agent';
import { Process } from './process';
import { MemoryBus } from '../memory/bus';
import { ToolRouter } from '../tools/router';
import { MessageBroker } from '../broker/broker';
import type {
  KernelConfig,
  ProcessOptions,
  KernelEvent,
  EventHandler,
  ProcessState,
  ExecutionContext,
  ExecutionResult,
  TaskInput,
  ToolDefinition,
  ChannelConfig,
} from './types';

/**
 * Kernel — The AgentVM runtime.
 *
 * The Kernel is the central orchestrator. It manages agent registration,
 * process lifecycle, memory, tools, messaging, and task execution.
 *
 * @example
 * ```ts
 * const kernel = new Kernel({ name: 'my-app' });
 *
 * const agent = new Agent({
 *   name: 'researcher',
 *   handler: async (ctx) => {
 *     await ctx.memory.set('status', 'working');
 *     return `Researched: ${ctx.input}`;
 *   },
 * });
 *
 * kernel.register(agent);
 * const proc = await kernel.spawn('researcher');
 * const result = await kernel.execute(proc.id, { task: 'find AI news' });
 * console.log(result.output);
 * ```
 */
export class Kernel {
  readonly name: string;
  private _agents: Map<string, Agent>;
  private _processes: Map<string, Process>;
  private _eventHandlers: Map<string, Set<EventHandler>>;
  private _config: KernelConfig;
  private _processCounter: number;

  /** Built-in memory bus — auto-allocates per-process namespaces */
  readonly memory: MemoryBus;

  /** Built-in tool router — register tools, kernel enforces permissions */
  readonly tools: ToolRouter;

  /** Built-in message broker — pub/sub and direct messaging */
  readonly broker: MessageBroker;

  constructor(config: KernelConfig = {}) {
    this.name = config.name ?? 'agentvm';
    this._agents = new Map();
    this._processes = new Map();
    this._eventHandlers = new Map();
    this._config = config;
    this._processCounter = 0;

    this.memory = new MemoryBus();
    this.tools = new ToolRouter();
    this.broker = new MessageBroker();

    if (config.on) {
      for (const [event, handler] of Object.entries(config.on)) {
        this.on(event, handler);
      }
    }

    this._emit('kernel:started', { name: this.name });
  }

  // ──────────────────────────────────────────────
  // Agent Registration
  // ──────────────────────────────────────────────

  register(...agents: Agent[]): void {
    for (const agent of agents) {
      if (this._agents.has(agent.name)) {
        throw new Error(`Agent "${agent.name}" is already registered`);
      }
      this._agents.set(agent.name, agent);
      this._emit('agent:registered', { name: agent.name });
    }
  }

  unregister(agentName: string): void {
    const running = this.getProcesses({ agentName, state: 'running' as ProcessState });
    if (running.length > 0) {
      throw new Error(
        `Cannot unregister "${agentName}": ${running.length} process(es) still running`
      );
    }
    this._agents.delete(agentName);
    this._emit('agent:unregistered', { name: agentName });
  }

  getAgent(name: string): Agent | undefined {
    return this._agents.get(name);
  }

  get agents(): Agent[] {
    return Array.from(this._agents.values());
  }

  // ──────────────────────────────────────────────
  // Tool Registration (convenience)
  // ──────────────────────────────────────────────

  registerTool(tool: ToolDefinition): void {
    this.tools.register(tool);
    this._emit('tool:registered', { name: tool.name });
  }

  // ──────────────────────────────────────────────
  // Channel Management (convenience)
  // ──────────────────────────────────────────────

  createChannel(config: ChannelConfig): void {
    this.broker.createChannel(config);
    this._emit('channel:created', { name: config.name });
  }

  // ──────────────────────────────────────────────
  // Process Lifecycle
  // ──────────────────────────────────────────────

  async spawn(agentName: string, options: ProcessOptions = {}): Promise<Process> {
    const agent = this._agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent "${agentName}" is not registered. Call kernel.register() first.`);
    }

    const maxProc = this._config.maxProcesses ?? Infinity;
    const activeCount = this.getProcesses({ active: true }).length;
    if (activeCount >= maxProc) {
      throw new Error(`Process limit reached (${maxProc}). Terminate a process before spawning.`);
    }

    const id = options.id ?? this._generateId(agentName);
    const process = new Process(id, agentName, options);

    this._processes.set(id, process);
    process._start();

    this._emit('process:spawned', { id, agentName });

    return process;
  }

  // ──────────────────────────────────────────────
  // Task Execution
  // ──────────────────────────────────────────────

  /**
   * Execute a task on a running process.
   *
   * Builds an ExecutionContext with memory, tools, and messaging,
   * then calls the agent's handler function.
   */
  async execute(processId: string, taskInput: TaskInput): Promise<ExecutionResult> {
    const process = this._getProcess(processId);

    if (process.state !== ('running' as ProcessState)) {
      throw new Error(
        `Cannot execute on process "${processId}": state is "${process.state}", expected "running"`
      );
    }

    const agent = this._agents.get(process.agentName);
    if (!agent) {
      throw new Error(`Agent "${process.agentName}" is no longer registered`);
    }

    if (!agent.handler) {
      throw new Error(
        `Agent "${agent.name}" has no handler function. Define a handler in the agent config.`
      );
    }

    const context = this._buildContext(process, agent, taskInput);

    const startTime = Date.now();
    this._emit('execution:started', {
      processId,
      agentName: agent.name,
      task: taskInput.task,
    });

    try {
      const output = await agent.handler(context);
      const duration = Date.now() - startTime;

      const result: ExecutionResult = {
        processId: process.id,
        agentName: agent.name,
        output,
        duration,
        events: [...process.events],
      };

      process.setMetadata('lastExecution', {
        task: taskInput.task,
        duration,
        completedAt: new Date().toISOString(),
        success: true,
      });

      this._emit('execution:completed', { processId, agentName: agent.name, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      process.setMetadata('lastExecution', {
        task: taskInput.task,
        duration,
        completedAt: new Date().toISOString(),
        success: false,
        error: err.message,
      });

      this._emit('execution:failed', {
        processId,
        agentName: agent.name,
        duration,
        error: err.message,
      });

      process._crash(err);
      throw err;
    }
  }

  /**
   * Build the ExecutionContext that gets passed to agent handlers.
   */
  private _buildContext(process: Process, agent: Agent, taskInput: TaskInput): ExecutionContext {
    const memoryAccessor = this.memory.getAccessor(process.id);

    return {
      processId: process.id,
      agentName: agent.name,
      input: taskInput.input ?? taskInput.task,

      memory: memoryAccessor,

      useTool: async (toolName: string, params: unknown) => {
        if (agent.tools.length > 0 && !agent.tools.includes(toolName)) {
          throw new Error(
            `Agent "${agent.name}" is not allowed to use tool "${toolName}". ` +
            `Allowed tools: ${agent.tools.join(', ')}`
          );
        }

        this._emit('tool:invoked', { processId: process.id, agentName: agent.name, tool: toolName });

        const result = await this.tools.invoke(toolName, params, {
          agentName: agent.name,
          processId: process.id,
          signal: process.signal,
        });

        this._emit('tool:completed', { processId: process.id, tool: toolName });
        return result;
      },

      publish: (channel: string, data: unknown) => {
        this.broker.publish(channel, process.id, data);
        this._emit('message:published', { processId: process.id, channel });
      },

      emit: (event: string, data?: unknown) => {
        this._emit(`agent:${event}`, { processId: process.id, agentName: agent.name, data });
      },

      signal: process.signal,
    };
  }

  // ──────────────────────────────────────────────
  // Process Management
  // ──────────────────────────────────────────────

  async pause(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._pause();
    this._emit('process:paused', { id: processId });
  }

  async resume(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._resume();
    this._emit('process:resumed', { id: processId });
  }

  async terminate(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._terminate();

    const agent = this._agents.get(process.agentName);
    if (!agent?.memory?.persistent) {
      this.memory.deleteNamespace(processId);
    }

    this._emit('process:terminated', { id: processId });
  }

  async shutdown(): Promise<void> {
    const active = this.getProcesses({ active: true });
    for (const p of active) {
      await this.terminate(p.id);
    }
    this._emit('kernel:shutdown', { name: this.name });
  }

  getProcess(id: string): Process | undefined {
    return this._processes.get(id);
  }

  getProcesses(filter: {
    agentName?: string;
    state?: ProcessState;
    active?: boolean;
  } = {}): Process[] {
    let results = Array.from(this._processes.values());

    if (filter.agentName) {
      results = results.filter((p) => p.agentName === filter.agentName);
    }
    if (filter.state) {
      results = results.filter((p) => p.state === filter.state);
    }
    if (filter.active) {
      results = results.filter(
        (p) => p.state === ('running' as ProcessState) || p.state === ('paused' as ProcessState)
      );
    }

    return results;
  }

  // ──────────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────────

  on(event: string, handler: EventHandler): () => void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
    return () => { this._eventHandlers.get(event)?.delete(handler); };
  }

  onAny(handler: EventHandler): () => void {
    return this.on('*', handler);
  }

  private _emit(type: string, data?: unknown): void {
    const event: KernelEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: this.name,
      timestamp: new Date(),
      data,
    };

    const handlers = this._eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event); } catch { /* swallow */ }
      }
    }

    const wildcardHandlers = this._eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try { handler(event); } catch { /* swallow */ }
      }
    }

    if (this._config.debug) {
      console.warn(`[${this.name}] ${type}`, data ?? '');
    }
  }

  // ──────────────────────────────────────────────
  // Internal Helpers
  // ──────────────────────────────────────────────

  private _getProcess(id: string): Process {
    const process = this._processes.get(id);
    if (!process) {
      throw new Error(`Process "${id}" not found`);
    }
    return process;
  }

  private _generateId(agentName: string): string {
    this._processCounter++;
    return `${agentName}-${this._processCounter}-${Date.now().toString(36)}`;
  }

  toString(): string {
    return `Kernel(${this.name}, agents=${this._agents.size}, processes=${this._processes.size})`;
  }
}
