/**
 * Tests for MCP stdio transport — uses a fake MCP server process.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import { Kernel } from '../../src/core/kernel';
import { MCPClient } from '../../src/mcp/client';

const FAKE_SERVER = path.resolve(__dirname, '../fixtures/fake-mcp-server.mjs');

describe('MCPClient stdio transport', () => {
  let kernel: Kernel;
  let mcp: MCPClient;

  afterEach(async () => {
    try {
      await mcp?.disconnectAll();
    } catch {
      // ignore
    }
  });

  it('should connect to a stdio MCP server and discover tools', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    const tools = await mcp.connect({
      name: 'fake',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('greet');
    expect(tools[1].name).toBe('add');
    expect(mcp.isConnected('fake')).toBe(true);
  });

  it('should discover resources', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'with-res',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    const servers = mcp.servers;
    expect(servers[0].resources).toHaveLength(1);
    expect(servers[0].resources[0].uri).toBe('test://data');
  });

  it('should auto-register tools with kernel', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'auto-reg',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    expect(kernel.tools.getTool('mcp:auto-reg:greet')).toBeDefined();
    expect(kernel.tools.getTool('mcp:auto-reg:add')).toBeDefined();
  });

  it('should call a tool on the stdio server', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'call-test',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    const result = await mcp.callTool('call-test', 'greet', { name: 'AgentVM' });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Hello, AgentVM!' }],
    });
  });

  it('should call add tool', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'add-test',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    const result = await mcp.callTool('add-test', 'add', { a: 3, b: 7 }) as {
      content: Array<{ text: string }>;
    };

    expect(result.content[0].text).toBe('10');
  });

  it('should read a resource', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'res-test',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    const result = await mcp.readResource('res-test', 'test://data') as {
      contents: Array<{ text: string }>;
    };

    expect(result.contents[0].text).toBe('resource content');
  });

  it('should disconnect and kill the process', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'disc-test',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    expect(mcp.isConnected('disc-test')).toBe(true);

    await mcp.disconnect('disc-test');

    expect(mcp.isConnected('disc-test')).toBe(false);
    expect(kernel.tools.getTool('mcp:disc-test:greet')).toBeUndefined();
  });

  it('should skip autoRegister when set to false', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'no-auto',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
      autoRegister: false,
    });

    expect(kernel.tools.getTool('mcp:no-auto:greet')).toBeUndefined();
    expect(kernel.tools.getTool('mcp:no-auto:add')).toBeUndefined();
  });

  it('should handle MCP tool error response', async () => {
    kernel = new Kernel();
    mcp = new MCPClient(kernel);

    await mcp.connect({
      name: 'err-test',
      transport: 'stdio',
      command: 'node',
      args: [FAKE_SERVER],
      timeout: 5000,
    });

    await expect(
      mcp.callTool('err-test', 'nonexistent_tool', {})
    ).rejects.toThrow('MCP tool error');
  });
});
