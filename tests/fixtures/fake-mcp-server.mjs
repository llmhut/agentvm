#!/usr/bin/env node
/**
 * Fake MCP server for testing — speaks JSON-RPC over stdin/stdout.
 */
import * as readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  // Notifications have no id — don't respond
  if (msg.id === undefined) return;

  if (msg.method === 'initialize') {
    respond(msg.id, { capabilities: {}, serverInfo: { name: 'fake-mcp', version: '1.0' } });
  } else if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: [
        { name: 'greet', description: 'Say hello', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
        { name: 'add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
      ],
    });
  } else if (msg.method === 'resources/list') {
    respond(msg.id, { resources: [{ uri: 'test://data', name: 'test-data' }] });
  } else if (msg.method === 'tools/call') {
    const toolName = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    if (toolName === 'greet') {
      respond(msg.id, { content: [{ type: 'text', text: `Hello, ${args.name ?? 'World'}!` }] });
    } else if (toolName === 'add') {
      respond(msg.id, { content: [{ type: 'text', text: String((args.a ?? 0) + (args.b ?? 0)) }] });
    } else {
      respondError(msg.id, -32601, `Unknown tool: ${toolName}`);
    }
  } else if (msg.method === 'resources/read') {
    respond(msg.id, { contents: [{ uri: msg.params?.uri, text: 'resource content' }] });
  } else {
    respondError(msg.id, -32601, `Unknown method: ${msg.method}`);
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}
