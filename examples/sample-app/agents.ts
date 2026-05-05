/**
 * Agent Definitions
 *
 * Three agents that collaborate:
 * 1. Researcher — fetches web content and extracts key info
 * 2. Writer — turns research into a polished article
 * 3. Fact-Checker — reviews the article for accuracy
 *
 * Each agent can run in "mock" mode (no API key needed) or
 * "real" mode (uses Anthropic Claude).
 */

import { Agent } from '../../src/core/agent';
import { createLLMAgent } from '../../src/llm/agent';
import type { AppConfig } from './config';

/**
 * Create all three agents.
 */
export function createAgents(config: AppConfig) {
  if (config.mock) {
    return createMockAgents();
  }
  return createLLMAgents();
}

// ──────────────────────────────────────────────
// Real LLM Agents (requires ANTHROPIC_API_KEY)
// ──────────────────────────────────────────────

function createLLMAgents() {
  const researcher = createLLMAgent({
    name: 'researcher',
    description: 'Researches topics by fetching and analyzing web content',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a research assistant. Given a topic, use the http_fetch tool to find relevant information from the web.

Your process:
1. Fetch 2-3 relevant URLs (news sites, Wikipedia, official sources)
2. Use extract_text to get readable content from the HTML
3. Synthesize the key findings into a structured research brief

Output a research brief with:
- Topic summary (2-3 sentences)
- Key facts (bullet points)
- Sources (URLs you fetched)

Be thorough but concise.`,
    tools: ['http_fetch', 'extract_text'],
    memory: { persistent: true },
    maxTurns: 6,
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
    onToolCall: (name, args) => {
      const a = args as Record<string, unknown>;
      if (a.url) console.log(`  🔧 ${name} → ${a.url}`);
    },
  });

  const writer = createLLMAgent({
    name: 'writer',
    description: 'Transforms research into polished articles',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a professional content writer. You will receive a research brief as input.

Transform it into a compelling, well-structured article (400-600 words):
- Engaging opening hook
- Clear section flow
- Data woven naturally into the narrative
- Forward-looking conclusion
- Professional but accessible tone

Output ONLY the article text.`,
    tools: [],
    maxTurns: 1,
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });

  const factChecker = createLLMAgent({
    name: 'fact-checker',
    description: 'Reviews articles for accuracy and quality',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a fact-checker and editor. You will receive a draft article.

Review it and output a JSON object (as a string) with:
{
  "score": <1-10 quality score>,
  "issues": ["list of factual concerns or weak claims"],
  "suggestions": ["list of improvements"],
  "verdict": "publish" | "revise" | "reject"
}

Be constructive but honest. Output ONLY the JSON.`,
    tools: [],
    maxTurns: 1,
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });

  return { researcher, writer, factChecker };
}

// ──────────────────────────────────────────────
// Mock Agents (no API key needed)
// ──────────────────────────────────────────────

function createMockAgents() {
  const researcher = new Agent({
    name: 'researcher',
    description: 'Researches topics (mock mode)',
    tools: ['http_fetch', 'extract_text'],
    memory: { persistent: true },
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
    handler: async (ctx) => {
      const topic = ctx.input as string;
      ctx.publish('status', { agent: 'researcher', message: `Starting research on: ${topic}` });

      // Actually use the tools even in mock mode
      let fetchedContent = '';
      try {
        const result = (await ctx.useTool('http_fetch', {
          url: 'https://httpbin.org/json',
        })) as { body: string };
        fetchedContent = `Fetched ${result.body.length} chars from httpbin.org`;
      } catch {
        fetchedContent = 'Could not fetch (offline mode)';
      }

      // Track this in memory
      const history = ((await ctx.memory.get('research_history')) as string[]) ?? [];
      history.push(topic);
      await ctx.memory.set('research_history', history);

      ctx.publish('status', { agent: 'researcher', message: 'Research complete' });

      return `## Research Brief: ${topic}

**Summary:** ${topic} is a rapidly evolving area with significant implications for technology and society.

**Key Facts:**
- AI agent frameworks have grown 300% in adoption since 2025
- The market for autonomous AI systems is projected to reach $50B by 2028
- Major players include LangChain, CrewAI, AutoGen, and AgentVM
- Tool-use and MCP integration are becoming standard features

**Sources:**
- https://httpbin.org/json (${fetchedContent})
- Mock data for demonstration purposes

**Research Count:** This is research #${history.length} in this session.`;
    },
  });

  const writer = new Agent({
    name: 'writer',
    description: 'Writes articles from research (mock mode)',
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
    handler: async (ctx) => {
      const research = ctx.input as string;
      ctx.publish('status', { agent: 'writer', message: 'Writing article...' });

      // Simulate some "thinking" time
      await new Promise((r) => setTimeout(r, 500));

      ctx.publish('status', { agent: 'writer', message: 'Article complete' });

      return `# The Rise of AI Agents: From Concept to Reality

The landscape of artificial intelligence is undergoing a fundamental shift. No longer confined to simple chatbots and text generators, AI systems are evolving into autonomous agents capable of planning, reasoning, and executing complex multi-step tasks.

## A Market in Motion

${research.includes('300%') ? 'With a 300% increase in adoption since 2025, ' : ''}AI agent frameworks have moved from experimental curiosities to production infrastructure. The projected $50 billion market by 2028 reflects not just hype, but genuine enterprise demand for systems that can operate with minimal human oversight.

## The Infrastructure Challenge

Every agent framework faces the same fundamental problems: how to manage process lifecycles, persist memory across sessions, route tools safely, and coordinate multiple agents. Projects like AgentVM are tackling this at the runtime level, providing the shared infrastructure that framework developers need.

## What's Next

The convergence of tool-use protocols like MCP, pluggable memory backends, and standardized agent contracts points toward a future where AI agents are as composable and interoperable as web services. The question is no longer whether agents will transform software development, but how quickly.

---
*Generated from research brief. Word count: ~180*`;
    },
  });

  const factChecker = new Agent({
    name: 'fact-checker',
    description: 'Checks article accuracy (mock mode)',
    contract: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
    handler: async (ctx) => {
      ctx.publish('status', { agent: 'fact-checker', message: 'Reviewing article...' });

      await new Promise((r) => setTimeout(r, 300));

      ctx.publish('status', { agent: 'fact-checker', message: 'Review complete' });

      return JSON.stringify(
        {
          score: 7,
          issues: [
            'The $50B market projection needs a specific source citation',
            'The 300% adoption figure should specify the measurement methodology',
          ],
          suggestions: [
            'Add specific company case studies for stronger evidence',
            'Include a counterpoint about agent reliability concerns',
            'The conclusion could be more specific about timeline',
          ],
          verdict: 'publish',
        },
        null,
        2,
      );
    },
  });

  return { researcher, writer, factChecker };
}
