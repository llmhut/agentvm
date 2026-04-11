/**
 * Built-in Tools — Practical tools that ship with AgentVM.
 *
 * These are optional — register only the ones your agents need.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { httpFetchTool, shellExecTool } from '@llmhut/agentvm/builtins';
 *
 * const kernel = new Kernel();
 * kernel.registerTool(httpFetchTool);
 * kernel.registerTool(shellExecTool);
 * ```
 */

import type { ToolDefinition } from '../core/types';

// ──────────────────────────────────────────────
// HTTP Fetch
// ──────────────────────────────────────────────

export const httpFetchTool: ToolDefinition = {
  name: 'http_fetch',
  description:
    'Fetch a URL and return its content. Supports GET, POST, PUT, DELETE. ' +
    'Returns { status, headers, body } where body is text.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      method: { type: 'string', description: 'HTTP method (default: GET)' },
      headers: { type: 'object', description: 'Request headers' },
      body: { type: 'string', description: 'Request body (for POST/PUT)' },
      timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
    },
    required: ['url'],
  },
  sideEffects: 'read',
  permission: 'public',
  rateLimit: 60,
  handler: async (params) => {
    const p = params as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    };

    const response = await fetch(p.url, {
      method: p.method ?? 'GET',
      headers: p.headers,
      body: p.body,
      signal: AbortSignal.timeout(p.timeout ?? 30_000),
    });

    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: body.length > 100_000 ? body.slice(0, 100_000) + '\n[truncated]' : body,
    };
  },
};

// ──────────────────────────────────────────────
// JSON Fetch (convenience wrapper)
// ──────────────────────────────────────────────

export const jsonFetchTool: ToolDefinition = {
  name: 'json_fetch',
  description:
    'Fetch a URL and parse the response as JSON. ' +
    'Returns the parsed JSON object directly.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      method: { type: 'string', description: 'HTTP method (default: GET)' },
      headers: { type: 'object', description: 'Request headers' },
      body: { type: 'string', description: 'Request body (for POST/PUT)' },
    },
    required: ['url'],
  },
  sideEffects: 'read',
  permission: 'public',
  rateLimit: 60,
  handler: async (params) => {
    const p = params as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };

    const response = await fetch(p.url, {
      method: p.method ?? 'GET',
      headers: { 'Accept': 'application/json', ...p.headers },
      body: p.body,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },
};

// ──────────────────────────────────────────────
// Shell Exec
// ──────────────────────────────────────────────

export const shellExecTool: ToolDefinition = {
  name: 'shell_exec',
  description:
    'Execute a shell command and return its output. ' +
    'Returns { stdout, stderr, exitCode }. Use with caution.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (optional)' },
      timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
    },
    required: ['command'],
  },
  sideEffects: 'execute',
  permission: 'admin',
  handler: async (params) => {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const p = params as { command: string; cwd?: string; timeout?: number };

    try {
      const { stdout, stderr } = await execAsync(p.command, {
        cwd: p.cwd,
        timeout: p.timeout ?? 30_000,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: (e.stdout ?? '').trim(),
        stderr: (e.stderr ?? '').trim(),
        exitCode: e.code ?? 1,
      };
    }
  },
};

// ──────────────────────────────────────────────
// File Read
// ──────────────────────────────────────────────

export const fileReadTool: ToolDefinition = {
  name: 'file_read',
  description: 'Read the contents of a file. Returns { content, size, encoding }.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      encoding: { type: 'string', description: 'Text encoding (default: utf-8)' },
      maxSize: { type: 'number', description: 'Max bytes to read (default: 1MB)' },
    },
    required: ['path'],
  },
  sideEffects: 'read',
  permission: 'restricted',
  handler: async (params) => {
    const fs = await import('node:fs/promises');
    const p = params as { path: string; encoding?: string; maxSize?: number };

    const maxSize = p.maxSize ?? 1024 * 1024;
    const stats = await fs.stat(p.path);

    if (stats.size > maxSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
    }

    const encoding = (p.encoding ?? 'utf-8') as BufferEncoding;
    const content = await fs.readFile(p.path, { encoding });

    return { content, size: stats.size, encoding };
  },
};

// ──────────────────────────────────────────────
// File Write
// ──────────────────────────────────────────────

export const fileWriteTool: ToolDefinition = {
  name: 'file_write',
  description: 'Write content to a file. Creates directories if needed.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      append: { type: 'boolean', description: 'Append instead of overwrite (default: false)' },
    },
    required: ['path', 'content'],
  },
  sideEffects: 'write',
  permission: 'admin',
  handler: async (params) => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const p = params as { path: string; content: string; append?: boolean };

    // Ensure directory exists
    await fs.mkdir(path.dirname(p.path), { recursive: true });

    if (p.append) {
      await fs.appendFile(p.path, p.content, 'utf-8');
    } else {
      await fs.writeFile(p.path, p.content, 'utf-8');
    }

    const stats = await fs.stat(p.path);
    return { path: p.path, size: stats.size, created: !p.append };
  },
};

// ──────────────────────────────────────────────
// Wait / Sleep
// ──────────────────────────────────────────────

export const waitTool: ToolDefinition = {
  name: 'wait',
  description: 'Wait for a specified number of milliseconds.',
  parameters: {
    type: 'object',
    properties: {
      ms: { type: 'number', description: 'Milliseconds to wait' },
    },
    required: ['ms'],
  },
  sideEffects: 'none',
  permission: 'public',
  handler: async (params, context) => {
    const p = params as { ms: number };
    const ms = Math.min(p.ms, 60_000); // Max 1 minute

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ waited: ms }), ms);
      context.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Wait aborted'));
      });
    });
  },
};

// ──────────────────────────────────────────────
// Convenience: register all built-in tools
// ──────────────────────────────────────────────

/** All built-in tools */
export const builtinTools: ToolDefinition[] = [
  httpFetchTool,
  jsonFetchTool,
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  waitTool,
];

/**
 * Register all built-in tools with a kernel.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { registerBuiltins } from '@llmhut/agentvm/builtins';
 *
 * const kernel = new Kernel();
 * registerBuiltins(kernel);
 * ```
 */
export function registerBuiltins(kernel: { registerTool: (tool: ToolDefinition) => void }): void {
  for (const tool of builtinTools) {
    kernel.registerTool(tool);
  }
}
