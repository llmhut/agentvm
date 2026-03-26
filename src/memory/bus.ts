import type { MemoryAccessor, MemoryEntry } from '../core/types';

/**
 * MemoryBus — Central memory management for AgentKernel.
 *
 * Provides namespaced memory access for agent processes.
 * Each process gets isolated working memory, and can optionally
 * access shared memory for cross-agent communication.
 */
export class MemoryBus {
  private _stores: Map<string, MemoryStore>;

  constructor() {
    this._stores = new Map();
  }

  /**
   * Get a memory accessor scoped to a namespace.
   * Each process should get its own namespace for isolation.
   */
  getAccessor(namespace: string): MemoryAccessor {
    if (!this._stores.has(namespace)) {
      this._stores.set(namespace, new MemoryStore(namespace));
    }
    const store = this._stores.get(namespace)!;

    return {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
      delete: (key: string) => store.delete(key),
      list: (prefix?: string) => store.list(prefix),
      clear: () => store.clear(),
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
    this._stores.delete(namespace);
  }

  /**
   * Get stats about memory usage.
   */
  get stats(): { namespaces: number; totalEntries: number } {
    let totalEntries = 0;
    for (const store of this._stores.values()) {
      totalEntries += store.size;
    }
    return { namespaces: this._stores.size, totalEntries };
  }
}

/**
 * MemoryStore — In-memory key-value store with namespace isolation.
 *
 * This is the default backend. Future backends (SQLite, Redis, PostgreSQL)
 * will implement the same interface.
 */
class MemoryStore {
  private _namespace: string;
  private _data: Map<string, MemoryEntry>;

  constructor(namespace: string) {
    this._namespace = namespace;
    this._data = new Map();
  }

  get size(): number {
    return this._data.size;
  }

  async get(key: string): Promise<unknown | undefined> {
    const entry = this._data.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (entry.ttl && Date.now() - entry.createdAt.getTime() > entry.ttl) {
      this._data.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set(key: string, value: unknown): Promise<void> {
    const now = new Date();
    const existing = this._data.get(key);

    this._data.set(key, {
      key,
      value,
      namespace: this._namespace,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this._data.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this._data.keys());
    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this._data.clear();
  }
}
