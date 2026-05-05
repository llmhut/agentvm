/**
 * Kernel Configuration
 *
 * Sets up the kernel with:
 * - SQLite memory backend (persists across runs)
 * - Built-in tools + custom tools
 * - Status channel for inter-agent updates
 */

import { Kernel } from '../../src/core/kernel';
import { SqliteBackend } from '../../src/memory/backends/sqlite';
import { httpFetchTool } from '../../src/builtins/tools';
import { extractTextTool } from './tools';

export interface AppConfig {
  /** Use mock LLM responses instead of real API calls */
  mock: boolean;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Create and configure the kernel.
 */
export async function createKernel(config: AppConfig) {
  // ── Memory: SQLite for persistence ──
  const backend = await SqliteBackend.create('./sample-app-data.db');

  const kernel = new Kernel({
    name: 'research-assistant',
    debug: config.debug,
    memoryBackend: backend,
  });

  // ── Tools ──
  kernel.registerTool(httpFetchTool);
  kernel.registerTool(extractTextTool);

  // ── Channels ──
  kernel.createChannel({
    name: 'status',
    type: 'pubsub',
    historyLimit: 50,
  });

  // Subscribe to status updates and print them
  kernel.broker.subscribe('status', 'console-logger', (msg) => {
    const data = msg.data as { agent: string; message: string };
    console.log(`  💬 [${data.agent}] ${data.message}`);
  });

  return { kernel, backend };
}
