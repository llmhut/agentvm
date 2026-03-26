import type { Agent } from './agent';
import { Process } from './process';
import type {
  KernelConfig,
  ProcessOptions,
  KernelEvent,
  EventHandler,
  ProcessState,
} from './types';

/**
 * Kernel — The AgentKernel runtime.
 *
 * The Kernel is the central orchestrator. It manages agent registration,
 * process lifecycle, and event dispatch.
 *
 * @example
 * ```ts
 * const kernel = new Kernel({ name: 'my-app', debug: true });
 *
 * const agent = new Agent({ name: 'researcher', ... });
 * kernel.register(agent);
 *
 * const process = await kernel.spawn('researcher');
 * console.log(process.state); // 'running'
 *
 * await kernel.terminate(process.id);
 * ```
 */
export class Kernel {
  readonly name: string;
  private _agents: Map<string, Agent>;
  private _processes: Map<string, Process>;
  private _eventHandlers: Map<string, Set<EventHandler>>;
  private _config: KernelConfig;
  private _processCounter: number;

  constructor(config: KernelConfig = {}) {
    this.name = config.name ?? 'agentkernel';
    this._agents = new Map();
    this._processes = new Map();
    this._eventHandlers = new Map();
    this._config = config;
    this._processCounter = 0;

    // Register initial event handlers
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

  /**
   * Register one or more agents with the kernel.
   */
  register(...agents: Agent[]): void {
    for (const agent of agents) {
      if (this._agents.has(agent.name)) {
        throw new Error(`Agent "${agent.name}" is already registered`);
      }
      this._agents.set(agent.name, agent);
      this._emit('agent:registered', { name: agent.name });
    }
  }

  /**
   * Unregister an agent. Fails if it has running processes.
   */
  unregister(agentName: string): void {
    const running = this.getProcesses({ agentName, state: 'running' as ProcessState });
    if (running.length > 0) {
      throw new Error(
        `Cannot unregister "${agentName}": ${running.length} process(es) still running`,
      );
    }
    this._agents.delete(agentName);
    this._emit('agent:unregistered', { name: agentName });
  }

  /**
   * Get a registered agent by name.
   */
  getAgent(name: string): Agent | undefined {
    return this._agents.get(name);
  }

  /**
   * List all registered agents.
   */
  get agents(): Agent[] {
    return Array.from(this._agents.values());
  }

  // ──────────────────────────────────────────────
  // Process Lifecycle
  // ──────────────────────────────────────────────

  /**
   * Spawn a new process for a registered agent.
   */
  async spawn(agentName: string, options: ProcessOptions = {}): Promise<Process> {
    const agent = this._agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent "${agentName}" is not registered. Call kernel.register() first.`);
    }

    // Check process limit
    const maxProc = this._config.maxProcesses ?? Infinity;
    const activeCount = this.getProcesses({ active: true }).length;
    if (activeCount >= maxProc) {
      throw new Error(`Process limit reached (${maxProc}). Terminate a process before spawning.`);
    }

    // Create process
    const id = options.id ?? this._generateId(agentName);
    const process = new Process(id, agentName, options);

    this._processes.set(id, process);
    process._start();

    this._emit('process:spawned', { id, agentName });

    return process;
  }

  /**
   * Pause a running process.
   */
  async pause(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._pause();
    this._emit('process:paused', { id: processId });
  }

  /**
   * Resume a paused process.
   */
  async resume(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._resume();
    this._emit('process:resumed', { id: processId });
  }

  /**
   * Terminate a process.
   */
  async terminate(processId: string): Promise<void> {
    const process = this._getProcess(processId);
    process._terminate();
    this._emit('process:terminated', { id: processId });
  }

  /**
   * Terminate all processes and shut down the kernel.
   */
  async shutdown(): Promise<void> {
    const active = this.getProcesses({ active: true });
    for (const p of active) {
      await this.terminate(p.id);
    }
    this._emit('kernel:shutdown', { name: this.name });
  }

  /**
   * Get a process by ID.
   */
  getProcess(id: string): Process | undefined {
    return this._processes.get(id);
  }

  /**
   * Query processes by filter criteria.
   */
  getProcesses(
    filter: {
      agentName?: string;
      state?: ProcessState;
      active?: boolean;
    } = {},
  ): Process[] {
    let results = Array.from(this._processes.values());

    if (filter.agentName) {
      results = results.filter((p) => p.agentName === filter.agentName);
    }
    if (filter.state) {
      results = results.filter((p) => p.state === filter.state);
    }
    if (filter.active) {
      results = results.filter(
        (p) => p.state === ('running' as ProcessState) || p.state === ('paused' as ProcessState),
      );
    }

    return results;
  }

  // ──────────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────────

  /**
   * Subscribe to kernel events.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this._eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events.
   */
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

    // Notify specific handlers
    const handlers = this._eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Don't let event handler errors crash the kernel
        }
      }
    }

    // Notify wildcard handlers
    const wildcardHandlers = this._eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch {
          // Swallow
        }
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
