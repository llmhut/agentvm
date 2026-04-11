/**
 * Example: LLM Research Agent
 *
 * A real AI agent that uses Claude to research topics,
 * fetch web content, and produce summaries.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/llm-research-agent.ts
 */

import { Kernel } from '../src';
import { createLLMAgent } from '../src/llm/agent';
import { httpFetchTool, jsonFetchTool } from '../src/builtins/tools';

async function main() {
  const kernel = new Kernel({ name: 'research-app', debug: false });

  // ── Register tools ──

  kernel.registerTool(httpFetchTool);
  kernel.registerTool(jsonFetchTool);

  // Custom tool: extract text from HTML
  kernel.registerTool({
    name: 'extract_text',
    description:
      'Extract readable text from HTML content. ' +
      'Strips tags and returns plain text.',
    parameters: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'HTML content to extract text from' },
        maxLength: { type: 'number', description: 'Max output length (default: 5000)' },
      },
      required: ['html'],
    },
    sideEffects: 'none',
    permission: 'public',
    handler: async (params) => {
      const p = params as { html: string; maxLength?: number };
      const maxLen = p.maxLength ?? 5000;

      // Simple HTML-to-text (production would use a real parser)
      const text = p.html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

      return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
    },
  });

  // ── Create the research agent ──

  const researcher = createLLMAgent({
    name: 'researcher',
    description: 'An AI research assistant that fetches and summarizes information',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a research assistant. Your job is to find information about topics the user asks about.

You have access to these tools:
- http_fetch: Fetch any URL and get its content
- json_fetch: Fetch a JSON API endpoint
- extract_text: Strip HTML tags to get readable text

Your research process:
1. Think about what URLs or APIs might have relevant information
2. Fetch content using the tools
3. Extract and synthesize the key findings
4. Present a clear, well-structured summary

Always cite your sources with URLs. Be thorough but concise.`,
    tools: ['http_fetch', 'json_fetch', 'extract_text'],
    memory: { persistent: true },
    maxTurns: 8,
    onToolCall: (name, args) => {
      const a = args as Record<string, unknown>;
      console.log(`  🔧 Tool: ${name}${a.url ? ` → ${a.url}` : ''}`);
    },
    onAfterCall: (response) => {
      console.log(
        `  📊 Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out` +
          (response.toolCalls.length > 0 ? ` | ${response.toolCalls.length} tool calls` : '')
      );
    },
  });

  // ── Run it ──

  kernel.register(researcher);
  const proc = await kernel.spawn('researcher');

  console.log('🔬 Research Agent Started\n');
  console.log('─'.repeat(60));

  const topic = process.argv[2] ?? 'What is the current Node.js LTS version and what are its key features?';
  console.log(`📋 Task: ${topic}\n`);

  const result = await kernel.execute(proc.id, { task: topic });

  console.log('─'.repeat(60));
  console.log('\n📝 Result:\n');
  console.log(result.output);
  console.log(`\n⏱️  Completed in ${result.duration}ms`);

  // Show token usage from memory
  const usage = (await kernel.memory.getAccessor(proc.id).get('__llm_usage')) as {
    inputTokens: number;
    outputTokens: number;
  };
  console.log(`📊 Total tokens: ${usage.inputTokens} input / ${usage.outputTokens} output`);

  await kernel.shutdown();
}

main().catch(console.error);
