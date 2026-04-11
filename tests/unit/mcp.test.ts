/**
 * Tests for src/mcp/client.ts — MCP Client
 *
 * Since we can't spawn real MCP servers in unit tests,
 * we test via internal method mocking and inject fake connections.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { MCPClient } from '../../src/mcp/client';

// ──────────────────────────────────────────────
// Helper: inject a fake connection into MCPClient
// ──────────────────────────────────────────────

function injectFakeConnection(
  mcp: MCPClient,
  serverName: string,
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = [],
  resources: Array<{ uri: string; name: string }> = [],
  sendFn?: (req: unknown) => Promise<unknown>,
  closeFn?: () => void,
) {
  // Access private _connections map
  const connections = (mcp as unknown as { _connections: Map<string, unknown> })._connections;

  connections.set(serverName, {
    config: { name: serverName, transport: 'stdio' },
    tools,
    resources,
    send: sendFn ?? (async (req: unknown) => ({
      jsonrpc: '2.0',
      id: (req as { id: string }).id,
      result: { content: [{ type: 'text', text: 'ok' }] },
    })),
    close: closeFn ?? (() => {}),
  });
}

// ──────────────────────────────────────────────
// Constructor & Basic State
// ──────────────────────────────────────────────

describe('MCPClient basics', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  beforeEach(() => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);
  });

  it('should start with empty servers list', () => {
    expect(mcp.servers).toEqual([]);
  });

  it('should report isConnected=false for unknown servers', () => {
    expect(mcp.isConnected('nope')).toBe(false);
  });

  it('should throw when disconnecting unknown server', async () => {
    await expect(mcp.disconnect('nope')).rejects.toThrow('not connected');
  });

  it('should throw when calling tool on unknown server', async () => {
    await expect(mcp.callTool('nope', 'tool', {})).rejects.toThrow('not connected');
  });

  it('should throw when reading resource from unknown server', async () => {
    await expect(mcp.readResource('nope', 'file://x')).rejects.toThrow('not connected');
  });

  it('should throw for unsupported transport', async () => {
    await expect(
      mcp.connect({ name: 'bad', transport: 'websocket' as 'stdio' })
    ).rejects.toThrow('Unsupported transport');
  });

  it('should throw for stdio without command', async () => {
    await expect(
      mcp.connect({ name: 'no-cmd', transport: 'stdio' })
    ).rejects.toThrow('requires a "command"');
  });

  it('should throw for SSE without URL', async () => {
    await expect(
      mcp.connect({ name: 'no-url', transport: 'sse' })
    ).rejects.toThrow('requires a "url"');
  });

  it('disconnectAll should be a no-op when empty', async () => {
    await expect(mcp.disconnectAll()).resolves.not.toThrow();
  });
});

// ──────────────────────────────────────────────
// Connection Management (with fake connections)
// ──────────────────────────────────────────────

describe('MCPClient connection management', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  beforeEach(() => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);
  });

  it('should report isConnected=true after injection', () => {
    injectFakeConnection(mcp, 'test-server');
    expect(mcp.isConnected('test-server')).toBe(true);
  });

  it('should list servers with tools and resources', () => {
    injectFakeConnection(
      mcp,
      'my-server',
      [{ name: 'read_file', description: 'Read a file' }],
      [{ uri: 'file:///tmp', name: 'tmp' }]
    );

    const servers = mcp.servers;
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('my-server');
    expect(servers[0].tools).toHaveLength(1);
    expect(servers[0].tools[0].name).toBe('read_file');
    expect(servers[0].resources).toHaveLength(1);
  });

  it('should throw duplicate server name on connect', async () => {
    injectFakeConnection(mcp, 'dupe');

    await expect(
      mcp.connect({ name: 'dupe', transport: 'stdio', command: 'echo' })
    ).rejects.toThrow('already connected');
  });

  it('should disconnect and call close', async () => {
    const closeFn = vi.fn();
    injectFakeConnection(mcp, 'closeable', [], [], undefined, closeFn);

    await mcp.disconnect('closeable');

    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(mcp.isConnected('closeable')).toBe(false);
  });

  it('should disconnect and unregister tools from kernel', async () => {
    // Register a tool that the MCP connection would have registered
    kernel.tools.register({
      name: 'mcp:srv:my_tool',
      description: 'test',
      parameters: { type: 'object' },
      sideEffects: 'execute',
      permission: 'public',
      handler: async () => 'ok',
    });

    injectFakeConnection(mcp, 'srv', [{ name: 'my_tool' }]);

    expect(kernel.tools.getTool('mcp:srv:my_tool')).toBeDefined();

    await mcp.disconnect('srv');

    expect(kernel.tools.getTool('mcp:srv:my_tool')).toBeUndefined();
  });

  it('should handle disconnect when tool already unregistered', async () => {
    // Don't register the tool in kernel — disconnect should not throw
    injectFakeConnection(mcp, 'already-gone', [{ name: 'phantom' }]);

    await expect(mcp.disconnect('already-gone')).resolves.not.toThrow();
  });

  it('disconnectAll should disconnect multiple servers', async () => {
    const close1 = vi.fn();
    const close2 = vi.fn();

    injectFakeConnection(mcp, 'server1', [], [], undefined, close1);
    injectFakeConnection(mcp, 'server2', [], [], undefined, close2);

    expect(mcp.servers).toHaveLength(2);

    await mcp.disconnectAll();

    expect(close1).toHaveBeenCalled();
    expect(close2).toHaveBeenCalled();
    expect(mcp.servers).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// callTool
// ──────────────────────────────────────────────

describe('MCPClient callTool', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  beforeEach(() => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);
  });

  it('should send tools/call and return result', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test',
      result: { content: [{ type: 'text', text: 'file contents here' }] },
    });

    injectFakeConnection(mcp, 'fs', [{ name: 'read_file' }], [], sendFn);

    const result = await mcp.callTool('fs', 'read_file', { path: '/tmp/test.txt' });

    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: '/tmp/test.txt' } },
      })
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'file contents here' }] });
  });

  it('should throw on MCP error response', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test',
      error: { code: -32600, message: 'Invalid request' },
    });

    injectFakeConnection(mcp, 'err-srv', [], [], sendFn);

    await expect(mcp.callTool('err-srv', 'bad', {})).rejects.toThrow('MCP tool error');
  });

  it('should use default empty args when none provided', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test',
      result: {},
    });

    injectFakeConnection(mcp, 'default-args', [], [], sendFn);

    await mcp.callTool('default-args', 'no_args');

    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { name: 'no_args', arguments: {} },
      })
    );
  });
});

// ──────────────────────────────────────────────
// readResource
// ──────────────────────────────────────────────

describe('MCPClient readResource', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  beforeEach(() => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);
  });

  it('should send resources/read and return result', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test',
      result: { contents: [{ uri: 'file:///tmp/data', text: 'data here' }] },
    });

    injectFakeConnection(mcp, 'res-srv', [], [{ uri: 'file:///tmp/data', name: 'data' }], sendFn);

    const result = await mcp.readResource('res-srv', 'file:///tmp/data');

    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'resources/read',
        params: { uri: 'file:///tmp/data' },
      })
    );
    expect(result).toBeDefined();
  });

  it('should throw on MCP resource error', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test',
      error: { code: -32601, message: 'Resource not found' },
    });

    injectFakeConnection(mcp, 'res-err', [], [], sendFn);

    await expect(mcp.readResource('res-err', 'file:///missing')).rejects.toThrow('MCP resource error');
  });
});

// ──────────────────────────────────────────────
// Tool Registration Bridge
// ──────────────────────────────────────────────

describe('MCPClient tool registration', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  beforeEach(() => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);
  });

  it('should register MCP tools with kernel on connect (via _registerMCPTool)', () => {
    // Simulate what connect() does after discovering tools
    const registerFn = (mcp as unknown as {
      _registerMCPTool: (serverName: string, tool: { name: string; description?: string; inputSchema?: unknown }) => void;
    })._registerMCPTool.bind(mcp);

    registerFn('test-srv', {
      name: 'list_files',
      description: 'List files in a directory',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    });

    const tool = kernel.tools.getTool('mcp:test-srv:list_files');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('mcp:test-srv:list_files');
    expect(tool!.description).toBe('List files in a directory');
    expect(tool!.sideEffects).toBe('execute');
    expect(tool!.permission).toBe('public');
  });

  it('should register tool with default description when none provided', () => {
    const registerFn = (mcp as unknown as {
      _registerMCPTool: (serverName: string, tool: { name: string }) => void;
    })._registerMCPTool.bind(mcp);

    registerFn('srv2', { name: 'no_desc' });

    const tool = kernel.tools.getTool('mcp:srv2:no_desc');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('MCP tool from srv2');
  });

  it('registered MCP tool handler should call callTool', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'x',
      result: { value: 'tool result' },
    });

    injectFakeConnection(mcp, 'handler-test', [{ name: 'do_thing' }], [], sendFn);

    // Register the tool
    const registerFn = (mcp as unknown as {
      _registerMCPTool: (serverName: string, tool: { name: string }) => void;
    })._registerMCPTool.bind(mcp);
    registerFn('handler-test', { name: 'do_thing' });

    // Invoke via kernel
    const tool = kernel.tools.getTool('mcp:handler-test:do_thing');
    const result = await tool!.handler(
      { input: 'test' },
      { agentName: 'agent', processId: 'proc', signal: new AbortController().signal }
    );

    expect(sendFn).toHaveBeenCalled();
    expect(result).toEqual({ value: 'tool result' });
  });
});

// ──────────────────────────────────────────────
// SSE Transport validation
// ──────────────────────────────────────────────

describe('MCPClient SSE transport', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should throw when SSE URL is missing', async () => {
    const kernel = new Kernel();
    const mcp = new MCPClient(kernel);

    await expect(
      mcp.connect({ name: 'no-url', transport: 'sse' })
    ).rejects.toThrow('requires a "url"');
  });

  it('should call initialize and tools/list via fetch for SSE', async () => {
    const kernel = new Kernel();
    const mcp = new MCPClient(kernel);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // initialize
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 'init',
            result: { capabilities: {} },
          }),
        };
      }
      if (callCount === 2) {
        // tools/list
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 'tools',
            result: {
              tools: [
                { name: 'sse_tool', description: 'A tool over SSE' },
              ],
            },
          }),
        };
      }
      // resources/list
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 'res',
          result: { resources: [] },
        }),
      };
    });

    const tools = await mcp.connect({
      name: 'sse-test',
      transport: 'sse',
      url: 'http://localhost:3000/sse',
    });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('sse_tool');
    expect(mcp.isConnected('sse-test')).toBe(true);

    // Should have auto-registered the tool
    expect(kernel.tools.getTool('mcp:sse-test:sse_tool')).toBeDefined();
  });

  it('should handle SSE fetch failure', async () => {
    const kernel = new Kernel();
    const mcp = new MCPClient(kernel);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(
      mcp.connect({
        name: 'sse-fail',
        transport: 'sse',
        url: 'http://localhost:3000/sse',
      })
    ).rejects.toThrow('MCP SSE request failed');
  });

  it('should handle autoRegister=false', async () => {
    const kernel = new Kernel();
    const mcp = new MCPClient(kernel);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }) };
      }
      if (callCount === 2) {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: '2',
            result: { tools: [{ name: 'hidden_tool' }] },
          }),
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: '3', result: { resources: [] } }) };
    });

    await mcp.connect({
      name: 'no-auto',
      transport: 'sse',
      url: 'http://localhost:3000/sse',
      autoRegister: false,
    });

    // Tool should NOT be registered with kernel
    expect(kernel.tools.getTool('mcp:no-auto:hidden_tool')).toBeUndefined();
  });

  it('should handle resources/list failure gracefully', async () => {
    const kernel = new Kernel();
    const mcp = new MCPClient(kernel);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }) };
      }
      if (callCount === 2) {
        return {
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: '2', result: { tools: [] } }),
        };
      }
      // resources/list throws
      throw new Error('resources not supported');
    });

    const tools = await mcp.connect({
      name: 'no-resources',
      transport: 'sse',
      url: 'http://localhost:3000/sse',
    });

    // Should still connect, just no resources
    expect(tools).toEqual([]);
    expect(mcp.servers[0].resources).toEqual([]);
  });
});
