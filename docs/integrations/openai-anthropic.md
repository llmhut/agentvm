# OpenAI & Anthropic

Use AgentVM tools directly with the OpenAI and Anthropic APIs.

## OpenAI

```typescript
import { Kernel, registerBuiltins, toOpenAITools, createToolExecutor } from '@llmhut/agentvm';
import OpenAI from 'openai';

const kernel = new Kernel();
registerBuiltins(kernel);

const client = new OpenAI();
const executor = createToolExecutor(kernel);
const tools = toOpenAITools(kernel, ['http_fetch']);

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Fetch https://example.com' }],
  tools,
});

for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await executor(call.function.name, JSON.parse(call.function.arguments));
  console.log(result);
}
```

## Anthropic

```typescript
import { Kernel, registerBuiltins, toAnthropicTools, createToolExecutor } from '@llmhut/agentvm';
import Anthropic from '@anthropic-ai/sdk';

const kernel = new Kernel();
registerBuiltins(kernel);

const client = new Anthropic();
const executor = createToolExecutor(kernel);
const tools = toAnthropicTools(kernel, ['http_fetch']);

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Fetch https://example.com' }],
  tools,
});

for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await executor(block.name, block.input as Record<string, unknown>);
    console.log(result);
  }
}
```

## Tool Executor

`createToolExecutor(kernel)` returns a simple function for running any tool call:

```typescript
const executor = createToolExecutor(kernel);
const result = await executor('http_fetch', { url: 'https://example.com' });
```

Works with any model response from any provider.
