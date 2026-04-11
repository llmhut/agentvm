/**
 * Tests for src/builtins/tools.ts — covers all tool handlers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  httpFetchTool,
  jsonFetchTool,
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  waitTool,
  builtinTools,
  registerBuiltins,
} from '../../src/builtins/tools';

const dummyContext = {
  agentName: 'test',
  processId: 'test-1',
  signal: new AbortController().signal,
};

// ──────────────────────────────────────────────
// http_fetch
// ──────────────────────────────────────────────

describe('httpFetchTool handler', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fetch a URL and return status, headers, body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      text: async () => 'hello world',
      headers: new Headers({ 'content-type': 'text/plain' }),
    });

    const result = (await httpFetchTool.handler(
      { url: 'https://example.com' },
      dummyContext
    )) as { status: number; statusText: string; headers: Record<string, string>; body: string };

    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.body).toBe('hello world');
    expect(result.headers['content-type']).toBe('text/plain');
  });

  it('should truncate body longer than 100k chars', async () => {
    const longBody = 'x'.repeat(150_000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      text: async () => longBody,
      headers: new Headers(),
    });

    const result = (await httpFetchTool.handler(
      { url: 'https://example.com/big' },
      dummyContext
    )) as { body: string };

    expect(result.body.length).toBeLessThan(150_000);
    expect(result.body).toContain('[truncated]');
  });

  it('should pass method, headers, and body to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      statusText: 'Created',
      text: async () => '{"id":1}',
      headers: new Headers(),
    });

    await httpFetchTool.handler(
      {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Authorization': 'Bearer tok' },
        body: '{"name":"test"}',
      },
      dummyContext
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Authorization': 'Bearer tok' },
        body: '{"name":"test"}',
      })
    );
  });
});

// ──────────────────────────────────────────────
// json_fetch
// ──────────────────────────────────────────────

describe('jsonFetchTool handler', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fetch and parse JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [1, 2, 3] }),
    });

    const result = await jsonFetchTool.handler(
      { url: 'https://api.example.com/data' },
      dummyContext
    );

    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it('should throw on non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      jsonFetchTool.handler({ url: 'https://example.com/missing' }, dummyContext)
    ).rejects.toThrow('HTTP 404');
  });

  it('should pass custom method and headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await jsonFetchTool.handler(
      { url: 'https://api.example.com', method: 'POST', headers: { 'X-Custom': 'yes' }, body: '{}' },
      dummyContext
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Custom': 'yes', 'Accept': 'application/json' }),
        body: '{}',
      })
    );
  });
});

// ──────────────────────────────────────────────
// shell_exec
// ──────────────────────────────────────────────

describe('shellExecTool handler', () => {
  it('should execute a command and return stdout', async () => {
    const result = (await shellExecTool.handler(
      { command: 'echo hello' },
      dummyContext
    )) as { stdout: string; stderr: string; exitCode: number };

    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('should handle failing commands gracefully', async () => {
    const result = (await shellExecTool.handler(
      { command: 'false' },
      dummyContext
    )) as { exitCode: number };

    expect(result.exitCode).not.toBe(0);
  });

  it('should respect cwd parameter', async () => {
    const result = (await shellExecTool.handler(
      { command: 'pwd', cwd: '/tmp' },
      dummyContext
    )) as { stdout: string };

    // /tmp may resolve to /private/tmp on macOS
    expect(result.stdout).toContain('tmp');
  });

  it('should capture stderr', async () => {
    const result = (await shellExecTool.handler(
      { command: 'echo err >&2' },
      dummyContext
    )) as { stderr: string };

    expect(result.stderr).toBe('err');
  });
});

// ──────────────────────────────────────────────
// file_read
// ──────────────────────────────────────────────

describe('fileReadTool handler', () => {
  const testDir = '/tmp/agentvm-test-read-' + Date.now();
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, 'hello from file', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should read a file and return content, size, encoding', async () => {
    const result = (await fileReadTool.handler(
      { path: testFile },
      dummyContext
    )) as { content: string; size: number; encoding: string };

    expect(result.content).toBe('hello from file');
    expect(result.size).toBe(15);
    expect(result.encoding).toBe('utf-8');
  });

  it('should throw for files exceeding maxSize', async () => {
    await expect(
      fileReadTool.handler({ path: testFile, maxSize: 5 }, dummyContext)
    ).rejects.toThrow('File too large');
  });

  it('should throw for non-existent files', async () => {
    await expect(
      fileReadTool.handler({ path: '/tmp/does-not-exist-xyz.txt' }, dummyContext)
    ).rejects.toThrow();
  });

  it('should accept custom encoding', async () => {
    const result = (await fileReadTool.handler(
      { path: testFile, encoding: 'ascii' },
      dummyContext
    )) as { encoding: string };

    expect(result.encoding).toBe('ascii');
  });
});

// ──────────────────────────────────────────────
// file_write
// ──────────────────────────────────────────────

describe('fileWriteTool handler', () => {
  const testDir = '/tmp/agentvm-test-write-' + Date.now();

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should write a file and return path and size', async () => {
    const filePath = path.join(testDir, 'output.txt');
    const result = (await fileWriteTool.handler(
      { path: filePath, content: 'written content' },
      dummyContext
    )) as { path: string; size: number; created: boolean };

    expect(result.path).toBe(filePath);
    expect(result.size).toBe(15);
    expect(result.created).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('written content');
  });

  it('should create nested directories', async () => {
    const filePath = path.join(testDir, 'a', 'b', 'c', 'deep.txt');
    await fileWriteTool.handler(
      { path: filePath, content: 'deep' },
      dummyContext
    );

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('deep');
  });

  it('should append when append=true', async () => {
    const filePath = path.join(testDir, 'append.txt');

    await fileWriteTool.handler(
      { path: filePath, content: 'first' },
      dummyContext
    );
    const result = (await fileWriteTool.handler(
      { path: filePath, content: ' second', append: true },
      dummyContext
    )) as { created: boolean };

    expect(result.created).toBe(false);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('first second');
  });

  it('should overwrite by default', async () => {
    const filePath = path.join(testDir, 'overwrite.txt');

    await fileWriteTool.handler({ path: filePath, content: 'old' }, dummyContext);
    await fileWriteTool.handler({ path: filePath, content: 'new' }, dummyContext);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('new');
  });
});

// ──────────────────────────────────────────────
// wait
// ──────────────────────────────────────────────

describe('waitTool handler', () => {
  it('should resolve after specified time', async () => {
    const result = await waitTool.handler({ ms: 10 }, dummyContext);
    expect(result).toEqual({ waited: 10 });
  });

  it('should cap at 60 seconds', async () => {
    const controller = new AbortController();
    // Abort immediately so we don't wait
    setTimeout(() => controller.abort(), 5);

    await expect(
      waitTool.handler(
        { ms: 120_000 },
        { ...dummyContext, signal: controller.signal }
      )
    ).rejects.toThrow('Wait aborted');
  });
});

// ──────────────────────────────────────────────
// registerBuiltins
// ──────────────────────────────────────────────

describe('registerBuiltins', () => {
  it('should export 6 tools', () => {
    expect(builtinTools).toHaveLength(6);
  });

  it('should register all tools with a kernel-like object', () => {
    const registered: string[] = [];
    registerBuiltins({
      registerTool: (tool: { name: string }) => registered.push(tool.name),
    });
    expect(registered).toEqual([
      'http_fetch', 'json_fetch', 'shell_exec', 'file_read', 'file_write', 'wait',
    ]);
  });
});
