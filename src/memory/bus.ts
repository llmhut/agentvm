import type { MemoryAccessor } from '../core/types';
import type { MemoryBackend } from './backend';
import { InMemoryBackend } from './backends/memory';

/**
 * MemoryBus — Central memory management for AgentVM.
 *
 * Provides namespaced memory access for agent processes.
 * Each process gets isolated working memory, and can optionally
 * access shared memory for cross-agent communication.
 *
 * Now supports pluggable backends — pass any `MemoryBackend` to the constructor.
 * Defaults to `InMemoryBackend` (fastest, no persistence).
 *
 * @example
 * ```ts
 * // Default in-memory
 * const bus = new MemoryBus();
 *
 * // With SQLite persistence
 * import { SqliteBackend } from '@llmhut/agentvm';
 * const backend = await SqliteBackend.create('./data/agentvm.db');
 * const bus = new MemoryBus(backend);
 * ```
 */
export class MemoryBus {
  private _backend: MemoryBackend;

  constructor(backend?: MemoryBackend) {
    this._backend = backend ?? new InMemoryBackend();
  }

  /** The active memory backend */
  get backend(): MemoryBackend {
    return this._backend;
  }

  /**
   * Get a memory accessor scoped to a namespace.
   * Each process should get its own namespace for isolation.
   */
  getAccessor(namespace: string): MemoryAccessor {
    const backend = this._backend;

    return {
      get: (key: string) => backend.get(namespace, key),
      set: (key: string, value: unknown) => backend.set(namespace, key, value),
      delete: (key: string) => backend.delete(namespace, key),
      list: (prefix?: string) => backend.list(namespace, prefix),
      clear: () => backend.clear(namespace),
    };
  }

  /**
   * Get the shared memory accessor (cross-process).
   */
  getSharedAccessor(): MemoryAccessor {
    return this.getAccessor('__shared__');
  }

  /**
   * Delete an entire namespace (called when process terminates).
   */
  deleteNamespace(namespace: string): void {
    this._backend.deleteNamespace(namespace).catch(() => {});
  }

  /**
   * Get stats about memory usage.
   *
   * For backward compatibility, this returns a synchronous result.
   * It works correctly with InMemoryBackend. For async backends, use statsAsync().
   */
  get stats(): { namespaces: number; totalEntries: number } {
    if (this._backend instanceof InMemoryBackend) {
      const s = (this._backend as InMemoryBackend).statsSync();
      return { namespaces: s.namespaces, totalEntries: s.totalEntries };
    }
    // For other backends, return a snapshot (may be stale)
    return this._cachedStats;
  }

  private _cachedStats = { namespaces: 0, totalEntries: 0 };

  /**
   * Get full stats from the backend (async).
   */
  async statsAsync(): Promise<{
    namespaces: number;
    totalEntries: number;
    backend: string;
    meta?: Record<string, unknown>;
  }> {
    return this._backend.stats();
  }

  /**
   * Close the backend (flush writes, release connections).
   */
  async close(): Promise<void> {
    return this._backend.close();
  }
}
