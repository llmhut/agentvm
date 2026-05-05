/**
 * SqliteBackend — File-based persistent memory backend.
 *
 * Uses sql.js (pure WASM SQLite) — no native bindings, works everywhere.
 * Data persists across process restarts.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { SqliteBackend } from '@llmhut/agentvm/memory/backends/sqlite';
 *
 * const backend = await SqliteBackend.create('./agentvm.db');
 * const kernel = new Kernel({ memoryBackend: backend });
 * ```
 */

import type { MemoryBackend, MemoryBackendStats } from '../backend';

// sql.js types (minimal)
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

export class SqliteBackend implements MemoryBackend {
  readonly name = 'sqlite';
  private _db: SqlJsDatabase;
  private _filePath: string | null;
  private _dirty = false;
  private _flushTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(db: SqlJsDatabase, filePath: string | null) {
    this._db = db;
    this._filePath = filePath;

    // Create table
    this._db.run(`
      CREATE TABLE IF NOT EXISTS memory (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (namespace, key)
      )
    `);

    // Index for namespace queries
    this._db.run(`
      CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory (namespace)
    `);

    // Auto-flush to disk every 5 seconds if dirty
    if (filePath) {
      this._flushTimer = setInterval(() => {
        void this._flush();
      }, 5000);
    }
  }

  /**
   * Create a new SqliteBackend.
   *
   * @param filePath — Path to the SQLite database file. Pass `null` or `:memory:` for in-memory only.
   */
  static async create(filePath?: string | null): Promise<SqliteBackend> {
    const initSqlJs = (await import('sql.js')).default;
    const SQL: SqlJsStatic = await initSqlJs();

    let db: SqlJsDatabase;

    if (filePath && filePath !== ':memory:') {
      // Try to load existing database
      try {
        const fs = await import('node:fs');
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          db = new SQL.Database(buffer);
        } else {
          db = new SQL.Database();
        }
      } catch {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
      filePath = null;
    }

    return new SqliteBackend(db, filePath ?? null);
  }

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    const results = this._db.exec(
      `SELECT value FROM memory WHERE namespace = '${this._escape(namespace)}' AND key = '${this._escape(key)}' LIMIT 1`,
    );

    if (results.length === 0 || results[0].values.length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(results[0].values[0][0] as string);
    } catch {
      return results[0].values[0][0];
    }
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    this._db.run(
      `INSERT OR REPLACE INTO memory (namespace, key, value, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [namespace, key, serialized],
    );
    this._dirty = true;
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    this._db.run(`DELETE FROM memory WHERE namespace = ? AND key = ?`, [namespace, key]);
    const modified = this._db.getRowsModified();
    if (modified > 0) this._dirty = true;
    return modified > 0;
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    let sql = `SELECT key FROM memory WHERE namespace = '${this._escape(namespace)}'`;
    if (prefix) {
      sql += ` AND key LIKE '${this._escape(prefix)}%'`;
    }

    const results = this._db.exec(sql);
    if (results.length === 0) return [];
    return results[0].values.map((row) => row[0] as string);
  }

  async clear(namespace: string): Promise<void> {
    this._db.run(`DELETE FROM memory WHERE namespace = ?`, [namespace]);
    this._dirty = true;
  }

  async deleteNamespace(namespace: string): Promise<void> {
    return this.clear(namespace);
  }

  async stats(): Promise<MemoryBackendStats> {
    const nsResult = this._db.exec(`SELECT COUNT(DISTINCT namespace) FROM memory`);
    const totalResult = this._db.exec(`SELECT COUNT(*) FROM memory`);

    const namespaces = nsResult.length > 0 ? (nsResult[0].values[0][0] as number) : 0;
    const totalEntries = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

    return {
      backend: 'sqlite',
      namespaces,
      totalEntries,
      meta: {
        filePath: this._filePath,
        sizeBytes: this._filePath ? this._db.export().byteLength : undefined,
      },
    };
  }

  /**
   * Flush changes to disk.
   */
  async flush(): Promise<void> {
    return this._flush();
  }

  async close(): Promise<void> {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this._flush();
    this._db.close();
  }

  private async _flush(): Promise<void> {
    if (!this._dirty || !this._filePath) return;
    try {
      const fs = await import('node:fs');
      const data = this._db.export();
      fs.writeFileSync(this._filePath, Buffer.from(data));
      this._dirty = false;
    } catch {
      // Silently fail — will retry on next interval
    }
  }

  private _escape(str: string): string {
    return str.replace(/'/g, "''");
  }
}
