# LLM Agents

`createLLMAgent()` creates agents powered by Anthropic Claude or OpenAI with an automatic tool-use loop.

## Basic Usage

```typescript
import { Kernel, registerBuiltins, createLLMAgent } from '@llmhut/agentvm';

const kernel = new Kernel();
registerBuiltins(kernel);

const agent = createLLMAgent({
  name: 'assistant',
  provider: 'anthropic',             // or 'openai'
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a helpful assistant.',
  tools: ['http_fetch'],
  memory: { persistent: true },
});

kernel.register(agent);
const proc = await kernel.spawn('assistant');
const result = await kernel.execute(proc.id, {
  task: 'What is the latest Node.js version?',
});
```

## How the Loop Works

1. Your task is sent to the LLM as a user message
2. If the LLM calls tools, AgentVM executes them via the ToolRouter
3. Tool results are fed back to the LLM
4. Repeat until the LLM produces a final text response (or `maxTurns` is hit)

```
User task → LLM → tool call? ──yes──→ execute tool → feed result → LLM → ...
                       │
                       no
                       ↓
                  return text
```

## Configuration

```typescript
createLLMAgent({
  name: 'agent',
  provider: 'anthropic',           // 'anthropic' | 'openai'
  model: 'claude-sonnet-4-20250514',
  systemPrompt: '...',
  tools: ['http_fetch', 'search'], // tool allowlist
  memory: { persistent: true },    // persist conversation history
  maxTurns: 10,                    // max tool-use loop iterations
  maxTokens: 4096,                 // max tokens per LLM response
  temperature: 0,                  // LLM temperature
  apiKey: 'sk-...',                // or set ANTHROPIC_API_KEY env var
  baseUrl: 'https://...',          // proxy URL

  // Agent contract (optional)
  contract: {
    input: { type: 'string' },
    output: { type: 'string' },
    maxLatency: 30000,
  },

  // Hooks
  onBeforeCall: (messages) => { /* inspect messages */ },
  onAfterCall: (response) => { /* inspect response, tokens */ },
  onToolCall: (name, args) => { console.log(`Tool: ${name}`) },
});
```

## Multi-Turn Conversations

Memory persists conversation history automatically. Execute multiple tasks on the same process:

```typescript
const proc = await kernel.spawn('assistant');

await kernel.execute(proc.id, { task: 'My name is Alice' });
const r2 = await kernel.execute(proc.id, { task: 'What is my name?' });
// r2.output includes "Alice" — the LLM remembers from context
```

## Pipelines

Chain agents sequentially:

```typescript
import { createPipeline } from '@llmhut/agentvm';

const researcher = createLLMAgent({ name: 'researcher', ... });
const writer = createLLMAgent({ name: 'writer', ... });

const pipeline = await createPipeline(kernel, [researcher, writer]);
const article = await pipeline('AI agents in 2026');
```

## Token Tracking

Token usage is tracked automatically in process memory and surfaced on the result:

```typescript
const result = await kernel.execute(proc.id, { task: 'work' });
console.log(result.tokensUsed); // 1523

const stats = await kernel.stats();
console.log(stats.tokens); // total across all processes
```
