/**
 * MCP Client — Model Context Protocol integration for AgentVM.
 *
 * Connects to MCP servers (stdio or SSE) and registers their tools
 * with the AgentVM ToolRouter, so any agent can call MCP tools
 * via `ctx.useTool('mcp:server-name:tool-name', params)`.
 *
 * @example
 * ```ts
 * const kernel = new Kernel();
 * const mcp = new MCPClient(kernel);
 *
 * // Connect to a stdio-based MCP server
 * await mcp.connect({
 *   name: 'filesystem',
 *   transport: 'stdio',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * // Connect to an SSE-based MCP server
 * await mcp.connect({
 *   name: 'weather',
 *   transport: 'sse',
 *   url: 'http://localhost:3001/sse',
 * });
 *
 * // Now any agent with tools: ['mcp:filesystem:read_file'] can use it
 * ```
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Kernel } from '../core/kernel';
import type { ToolDefinition, ToolContext } from '../core/types';
import type { SchemaDefinition } from '../core/types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface MCPServerConfig {
  /** Unique name for this server connection */
  name: string;
  /** Transport type */
  transport: 'stdio' | 'sse';
  /** For stdio: command to spawn */
  command?: string;
  /** For stdio: command arguments */
  args?: string[];
  /** For stdio: environment variables */
  env?: Record<string, string>;
  /** For sse: server URL */
  url?: string;
  /** Timeout for initialization in ms (default: 30000) */
  timeout?: number;
  /** Auto-register discovered tools with kernel (default: true) */
  autoRegister?: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPConnection {
  config: MCPServerConfig;
  tools: MCPTool[];
  resources: MCPResource[];
  send: (request: JSONRPCRequest) => Promise<JSONRPCResponse>;
  close: () => void;
}

// ──────────────────────────────────────────────
// MCP Client
// ──────────────────────────────────────────────

export class MCPClient {
  private _kernel: Kernel;
  private _connections: Map<string, MCPConnection>;

  constructor(kernel: Kernel) {
    this._kernel = kernel;
    this._connections = new Map();
  }

  /**
   * Connect to an MCP server and discover its tools.
   */
  async connect(config: MCPServerConfig): Promise<MCPTool[]> {
    if (this._connections.has(config.name)) {
      throw new Error(`MCP server "${config.name}" is already connected`);
    }

    let connection: MCPConnection;

    if (config.transport === 'stdio') {
      connection = await this._connectStdio(config);
    } else if (config.transport === 'sse') {
      connection = await this._connectSSE(config);
    } else {
      throw new Error(`Unsupported transport: ${config.transport}`);
    }

    this._connections.set(config.name, connection);

    // Auto-register tools with the kernel
    if (config.autoRegister !== false) {
      for (const tool of connection.tools) {
        this._registerMCPTool(config.name, tool);
      }
    }

    return connection.tools;
  }

  /**
   * Disconnect from an MCP server and unregister its tools.
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this._connections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    // Unregister tools from kernel
    for (const tool of connection.tools) {
      const toolName = `mcp:${serverName}:${tool.name}`;
      try {
        this._kernel.tools.unregister(toolName);
      } catch {
        // Tool might already be unregistered
      }
    }

    connection.close();
    this._connections.delete(serverName);
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll(): Promise<void> {
    for (const name of this._connections.keys()) {
      await this.disconnect(name);
    }
  }

  /**
   * Call a tool on an MCP server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const connection = this._connections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    const response = await connection.send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    if (response.error) {
      throw new Error(`MCP tool error: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * Read a resource from an MCP server.
   */
  async readResource(serverName: string, uri: string): Promise<unknown> {
    const connection = this._connections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    const response = await connection.send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'resources/read',
      params: { uri },
    });

    if (response.error) {
      throw new Error(`MCP resource error: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * List all connected servers.
   */
  get servers(): { name: string; tools: MCPTool[]; resources: MCPResource[] }[] {
    return Array.from(this._connections.entries()).map(([name, conn]) => ({
      name,
      tools: conn.tools,
      resources: conn.resources,
    }));
  }

  /**
   * Get connection status for a server.
   */
  isConnected(serverName: string): boolean {
    return this._connections.has(serverName);
  }

  // ──────────────────────────────────────────────
  // Stdio Transport
  // ──────────────────────────────────────────────

  private async _connectStdio(config: MCPServerConfig): Promise<MCPConnection> {
    if (!config.command) {
      throw new Error('Stdio transport requires a "command" field');
    }

    const child = spawn(config.command, config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
    });

    const pending = new Map<
      string | number,
      {
        resolve: (value: JSONRPCResponse) => void;
        reject: (reason: Error) => void;
      }
    >();

    let buffer = '';

    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Parse newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as JSONRPCResponse;
          const handler = pending.get(msg.id);
          if (handler) {
            pending.delete(msg.id);
            handler.resolve(msg);
          }
        } catch {
          // Skip non-JSON lines (logs, etc.)
        }
      }
    });

    child.on('error', (err: Error) => {
      for (const handler of pending.values()) {
        handler.reject(err);
      }
      pending.clear();
    });

    child.on('exit', () => {
      for (const handler of pending.values()) {
        handler.reject(new Error('MCP server process exited'));
      }
      pending.clear();
    });

    const send = (request: JSONRPCRequest): Promise<JSONRPCResponse> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(request.id);
          reject(new Error(`MCP request timed out: ${request.method}`));
        }, config.timeout ?? 30_000);

        pending.set(request.id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (reason) => {
            clearTimeout(timeout);
            reject(reason);
          },
        });

        child.stdin!.write(JSON.stringify(request) + '\n');
      });
    };

    // Initialize the connection
    await send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agentvm', version: '0.2.0' },
      },
    });

    // Send initialized notification (no id = notification)
    child.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    );

    // Discover tools
    const toolsResponse = await send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/list',
    });

    const tools: MCPTool[] = (toolsResponse.result as { tools?: MCPTool[] })?.tools ?? [];

    // Discover resources (optional, may fail)
    let resources: MCPResource[] = [];
    try {
      const resourcesResponse = await send({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'resources/list',
      });
      resources = (resourcesResponse.result as { resources?: MCPResource[] })?.resources ?? [];
    } catch {
      // Resources not supported by this server
    }

    return {
      config,
      tools,
      resources,
      send,
      close: () => {
        child.kill('SIGTERM');
      },
    };
  }

  // ──────────────────────────────────────────────
  // SSE Transport
  // ──────────────────────────────────────────────

  private async _connectSSE(config: MCPServerConfig): Promise<MCPConnection> {
    if (!config.url) {
      throw new Error('SSE transport requires a "url" field');
    }

    // For SSE transport, we POST JSON-RPC to the server's message endpoint
    // and receive responses via SSE. For simplicity, we use a request/response
    // pattern over HTTP POST (which most MCP SSE servers support).
    const baseUrl = config.url.replace(/\/sse$/, '');

    const send = async (request: JSONRPCRequest): Promise<JSONRPCResponse> => {
      const response = await fetch(`${baseUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(config.timeout ?? 30_000),
      });

      if (!response.ok) {
        throw new Error(`MCP SSE request failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as JSONRPCResponse;
    };

    // Initialize
    await send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agentvm', version: '0.2.0' },
      },
    });

    // Discover tools
    const toolsResponse = await send({
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/list',
    });

    const tools: MCPTool[] = (toolsResponse.result as { tools?: MCPTool[] })?.tools ?? [];

    let resources: MCPResource[] = [];
    try {
      const resourcesResponse = await send({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'resources/list',
      });
      resources = (resourcesResponse.result as { resources?: MCPResource[] })?.resources ?? [];
    } catch {
      // Resources not supported
    }

    return {
      config,
      tools,
      resources,
      send,
      close: () => {
        // SSE connections don't need explicit cleanup
      },
    };
  }

  // ──────────────────────────────────────────────
  // Tool Registration Bridge
  // ──────────────────────────────────────────────

  private _registerMCPTool(serverName: string, mcpTool: MCPTool): void {
    const toolName = `mcp:${serverName}:${mcpTool.name}`;

    const toolDef: ToolDefinition = {
      name: toolName,
      description: mcpTool.description ?? `MCP tool from ${serverName}`,
      parameters: {
        type: (mcpTool.inputSchema?.type as 'object') ?? 'object',
        properties: mcpTool.inputSchema?.properties as Record<string, SchemaDefinition> | undefined,
        required: mcpTool.inputSchema?.required,
      },
      sideEffects: 'execute',
      permission: 'public',
      handler: async (params: unknown, _context: ToolContext) => {
        return this.callTool(serverName, mcpTool.name, (params as Record<string, unknown>) ?? {});
      },
    };

    this._kernel.tools.register(toolDef);
  }
}
