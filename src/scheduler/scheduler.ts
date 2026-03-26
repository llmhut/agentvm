import type { TaskDefinition, SchedulerStrategy } from '../core/types';

/**
 * Scheduler — Task execution engine with dependency resolution.
 *
 * Supports sequential, parallel, conditional, and race strategies.
 */
export class Scheduler {
  private _queue: TaskDefinition[];
  private _running: Map<string, { task: TaskDefinition; startedAt: number }>;
  private _completed: Map<string, { task: TaskDefinition; result: unknown; duration: number }>;
  private _failed: Map<string, { task: TaskDefinition; error: Error }>;

  constructor() {
    this._queue = [];
    this._running = new Map();
    this._completed = new Map();
    this._failed = new Map();
  }

  /**
   * Add a task to the queue.
   */
  enqueue(task: TaskDefinition): void {
    this._queue.push(task);
    this._sortQueue();
  }

  /**
   * Add multiple tasks at once.
   */
  enqueueAll(tasks: TaskDefinition[]): void {
    this._queue.push(...tasks);
    this._sortQueue();
  }

  /**
   * Execute tasks using the specified strategy.
   */
  async execute(
    tasks: TaskDefinition[],
    strategy: SchedulerStrategy,
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<Map<string, unknown>> {
    switch (strategy) {
      case 'sequential':
        return this._executeSequential(tasks, executor);
      case 'parallel':
        return this._executeParallel(tasks, executor);
      case 'race':
        return this._executeRace(tasks, executor);
      case 'conditional':
        return this._executeConditional(tasks, executor);
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  // ── Strategies ──

  private async _executeSequential(
    tasks: TaskDefinition[],
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();
    const ordered = this._resolveOrder(tasks);

    for (const task of ordered) {
      const startedAt = Date.now();
      this._running.set(task.id, { task, startedAt });

      try {
        const result = await this._executeWithRetry(task, executor);
        const duration = Date.now() - startedAt;
        results.set(task.id, result);
        this._completed.set(task.id, { task, result, duration });
      } catch (error) {
        this._failed.set(task.id, { task, error: error as Error });
        throw error; // Sequential fails fast
      } finally {
        this._running.delete(task.id);
      }
    }

    return results;
  }

  private async _executeParallel(
    tasks: TaskDefinition[],
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();

    // Group by dependency layers
    const layers = this._buildLayers(tasks);

    for (const layer of layers) {
      const promises = layer.map(async (task) => {
        const startedAt = Date.now();
        this._running.set(task.id, { task, startedAt });

        try {
          const result = await this._executeWithRetry(task, executor);
          const duration = Date.now() - startedAt;
          results.set(task.id, result);
          this._completed.set(task.id, { task, result, duration });
        } catch (error) {
          this._failed.set(task.id, { task, error: error as Error });
        } finally {
          this._running.delete(task.id);
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  private async _executeRace(
    tasks: TaskDefinition[],
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();

    const result = await Promise.race(
      tasks.map(async (task) => {
        const res = await executor(task);
        return { taskId: task.id, result: res };
      }),
    );

    results.set(result.taskId, result.result);
    return results;
  }

  private async _executeConditional(
    tasks: TaskDefinition[],
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<Map<string, unknown>> {
    // Conditional: execute tasks in order, stop if any returns falsy
    const results = new Map<string, unknown>();
    const ordered = this._resolveOrder(tasks);

    for (const task of ordered) {
      const result = await executor(task);
      results.set(task.id, result);

      if (!result) break; // Stop on falsy result
    }

    return results;
  }

  // ── Retry Logic ──

  private async _executeWithRetry(
    task: TaskDefinition,
    executor: (task: TaskDefinition) => Promise<unknown>,
  ): Promise<unknown> {
    const maxAttempts = task.retry?.maxAttempts ?? 1;
    const backoff = task.retry?.backoff ?? 'fixed';
    const delayMs = task.retry?.delayMs ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executor(task);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          const delay = backoff === 'exponential' ? delayMs * Math.pow(2, attempt - 1) : delayMs;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // ── Dependency Resolution ──

  private _resolveOrder(tasks: TaskDefinition[]): TaskDefinition[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const visited = new Set<string>();
    const result: TaskDefinition[] = [];

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task) return;

      for (const dep of task.dependsOn ?? []) {
        visit(dep);
      }

      result.push(task);
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }

  private _buildLayers(tasks: TaskDefinition[]): TaskDefinition[][] {
    const layers: TaskDefinition[][] = [];
    const placed = new Set<string>();

    while (placed.size < tasks.length) {
      const layer: TaskDefinition[] = [];

      for (const task of tasks) {
        if (placed.has(task.id)) continue;

        const deps = task.dependsOn ?? [];
        const depsResolved = deps.every((d) => placed.has(d));

        if (depsResolved) {
          layer.push(task);
        }
      }

      if (layer.length === 0) {
        throw new Error('Circular dependency detected in task graph');
      }

      for (const task of layer) {
        placed.add(task.id);
      }

      layers.push(layer);
    }

    return layers;
  }

  private _sortQueue(): void {
    this._queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  // ── Stats ──

  get stats() {
    return {
      queued: this._queue.length,
      running: this._running.size,
      completed: this._completed.size,
      failed: this._failed.size,
    };
  }
}
