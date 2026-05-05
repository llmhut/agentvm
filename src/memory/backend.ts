/**
 * MemoryBackend — The interface all storage backends implement.
 *
 * Built-in backends:
 * - `MemoryBackend` (default) — in-process Map, fastest, no persistence
 * - `SqliteBackend` — file-based, zero-config persistence
 *
 * All operations are scoped by namespace (typically the process ID).
 */

export interface MemoryBackend {
  /** Backend name for logging and config */
  readonly name: string;

  /** Get a value by key within a namespace */
  get(namespace: string, key: string): Promise<unknown | undefined>;

  /** Set a value by key within a namespace */
  set(namespace: string, key: string, value: unknown): Promise<void>;

  /** Delete a key within a namespace. Returns true if key existed. */
  delete(namespace: string, key: string): Promise<boolean>;

  /** List all keys in a namespace, optionally filtered by prefix */
  list(namespace: string, prefix?: string): Promise<string[]>;

  /** Clear all keys in a namespace */
  clear(namespace: string): Promise<void>;

  /** Delete an entire namespace */
  deleteNamespace(namespace: string): Promise<void>;

  /** Get stats about the backend */
  stats(): Promise<MemoryBackendStats>;

  /** Gracefully close the backend (flush writes, close connections) */
  close(): Promise<void>;
}

export interface MemoryBackendStats {
  /** Backend name */
  backend: string;
  /** Number of active namespaces */
  namespaces: number;
  /** Total number of entries across all namespaces */
  totalEntries: number;
  /** Backend-specific metadata */
  meta?: Record<string, unknown>;
}
