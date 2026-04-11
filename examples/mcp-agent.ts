/**
 * Example: MCP Integration
 *
 * Shows how to connect AgentVM to MCP servers and use their tools
 * in AI agents. This example connects to an MCP filesystem server
 * so the agent can read and write files.
 *
 * Setup:
 *   npm install @modelcontextprotocol/server-filesystem
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-... npx tsx examples/mcp-agent.ts
 */

import { Kernel } from '../src';
import { MCPClient } from '../src/mcp/client';
import { createLLMAgent } from '../src/llm/agent';

async function main() {
  const kernel = new Kernel({ name: 'mcp-demo', debug: false });
  const mcp = new MCPClient(kernel);

  // ── Connect to an MCP server ──
  console.log('🔌 Connecting to MCP filesystem server...\n');

  try {
    const tools = await mcp.connect({
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/agentvm-demo'],
    });

    console.log(`✅ Connected! ${tools.length} tools available:`);
    for (const tool of tools) {
      console.log(`   • mcp:filesystem:${tool.name} — ${tool.description ?? 'no description'}`);
    }
    console.log();
  } catch (error) {
    console.log('⚠️  MCP server not available, running with simulated tools instead.\n');
    console.log('   To use real MCP tools, install the filesystem server:');
    console.log('   npm install @modelcontextprotocol/server-filesystem\n');

    // Register simulated file tools for demo purposes
    kernel.registerTool({
      name: 'mcp:filesystem:read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      sideEffects: 'read',
      permission: 'public',
      handler: async (params) => {
        const p = params as { path: string };
        return { content: `[simulated] Contents of ${p.path}` };
      },
    });

    kernel.registerTool({
      name: 'mcp:filesystem:write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      sideEffects: 'write',
      permission: 'public',
      handler: async (params) => {
        const p = params as { path: string; content: string };
        console.log(`  📁 [simulated write] ${p.path} (${p.content.length} chars)`);
        return { success: true, path: p.path };
      },
    });
  }

  // ── Create an agent that uses MCP tools ──

  const fileAgent = createLLMAgent({
    name: 'file-assistant',
    description: 'An AI assistant that can read and write files via MCP',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a file management assistant. You can read and write files using these tools:
- mcp:filesystem:read_file — Read a file's contents. Params: { path: string }
- mcp:filesystem:write_file — Write content to a file. Params: { path: string, content: string }

Help users organize, create, and manage files. Be helpful and efficient.`,
    tools: ['mcp:filesystem:read_file', 'mcp:filesystem:write_file'],
    maxTurns: 5,
    onToolCall: (name, args) => {
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);
    },
  });

  kernel.register(fileAgent);
  const proc = await kernel.spawn('file-assistant');

  // ── Run a task ──

  const task = 'Create a file at /tmp/agentvm-demo/hello.txt with a greeting message, then read it back to confirm.';
  console.log('─'.repeat(60));
  console.log(`📋 Task: ${task}\n`);

  const result = await kernel.execute(proc.id, { task });

  console.log('\n' + '─'.repeat(60));
  console.log('\n📝 Result:\n');
  console.log(result.output);
  console.log(`\n⏱️  Completed in ${result.duration}ms`);

  // Cleanup
  await mcp.disconnectAll();
  await kernel.shutdown();
}

main().catch(console.error);
