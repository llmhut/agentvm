/**
 * Example: Multi-Agent Content Pipeline
 *
 * Three LLM agents working together:
 *   Researcher → Writer → Editor
 *
 * The researcher finds information, the writer creates an article,
 * and the editor polishes it. Each agent's output flows to the next.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/llm-pipeline.ts
 */

import { Kernel } from '../src';
import { createLLMAgent } from '../src/llm/agent';
import { httpFetchTool } from '../src/builtins/tools';

async function main() {
  const kernel = new Kernel({ name: 'content-pipeline' });

  // Register shared tools
  kernel.registerTool(httpFetchTool);

  // ── Agent 1: Researcher ──
  const researcher = createLLMAgent({
    name: 'researcher',
    description: 'Researches topics and gathers facts',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a research specialist. Given a topic, produce a structured research brief with:
- Key facts and data points
- Recent developments
- Different perspectives
- Source URLs

Output ONLY the research brief — no commentary. Be factual and thorough.`,
    tools: ['http_fetch'],
    maxTurns: 5,
  });

  // ── Agent 2: Writer ──
  const writer = createLLMAgent({
    name: 'writer',
    description: 'Transforms research into polished articles',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a professional content writer. You will receive a research brief as input.
Transform it into a compelling, well-structured article (600-800 words) that:
- Has an engaging opening hook
- Uses clear section headings
- Weaves data naturally into the narrative
- Ends with a forward-looking conclusion
- Maintains a professional but accessible tone

Output ONLY the article text. Do not include meta-commentary.`,
    tools: [],
    maxTurns: 1,
  });

  // ── Agent 3: Editor ──
  const editor = createLLMAgent({
    name: 'editor',
    description: 'Polishes and fact-checks articles',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a senior editor. You will receive a draft article.
Your job:
1. Fix any grammar, spelling, or style issues
2. Improve clarity and flow
3. Strengthen weak sentences
4. Ensure consistent tone
5. Add a suggested headline and subtitle

Output the final polished article with the headline at the top.
At the very end, add an "Editor's Notes" section with any suggestions.`,
    tools: [],
    maxTurns: 1,
  });

  // ── Register all agents ──
  kernel.register(researcher, writer, editor);

  // ── Run the pipeline ──
  const topic = process.argv[2] ?? 'The impact of AI agents on software development in 2026';
  console.log('🔗 Content Pipeline\n');
  console.log('─'.repeat(60));
  console.log(`📋 Topic: ${topic}\n`);

  const agents = [
    { agent: researcher, label: '🔬 Researcher' },
    { agent: writer, label: '✍️  Writer' },
    { agent: editor, label: '📝 Editor' },
  ];

  let currentInput: unknown = topic;

  for (const { agent, label } of agents) {
    console.log(`${label} working...`);
    const startTime = Date.now();

    const proc = await kernel.spawn(agent.name);
    const result = await kernel.execute(proc.id, {
      task: typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput),
      input: currentInput,
    });

    const duration = Date.now() - startTime;
    console.log(`  ✅ Done in ${duration}ms`);

    currentInput = result.output;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📄 FINAL OUTPUT:\n');
  console.log(currentInput);

  await kernel.shutdown();
}

main().catch(console.error);
