/**
 * InMemoryBackend — Default in-process memory backend.
 *
 * Fastest possible backend. No persistence — data is lost when the process exits.
 * This is the default when no backend is configured.
 */

import type { MemoryBackend, MemoryBackendStats } from '../backend';

export class InMemoryBackend implements MemoryBackend {
  readonly name = 'memory';
  private _stores: Map<string, Map<string, unknown>>;

  constructor() {
    this._stores = new Map();
  }

  private _getStore(namespace: string): Map<string, unknown> {
    if (!this._stores.has(namespace)) {
      this._stores.set(namespace, new Map());
    }
    return this._stores.get(namespace)!;
  }

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    return this._getStore(namespace).get(key);
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    this._getStore(namespace).set(key, value);
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    return this._getStore(namespace).delete(key);
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    const keys = Array.from(this._getStore(namespace).keys());
    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }

  async clear(namespace: string): Promise<void> {
    this._getStore(namespace).clear();
  }

  async deleteNamespace(namespace: string): Promise<void> {
    this._stores.delete(namespace);
  }

  async stats(): Promise<MemoryBackendStats> {
    return this.statsSync();
  }

  /** Synchronous stats — used by MemoryBus.stats getter for backward compat */
  statsSync(): { backend: string; namespaces: number; totalEntries: number } {
    let totalEntries = 0;
    for (const store of this._stores.values()) {
      totalEntries += store.size;
    }
    return { backend: 'memory', namespaces: this._stores.size, totalEntries };
  }

  async close(): Promise<void> {
    this._stores.clear();
  }
}
