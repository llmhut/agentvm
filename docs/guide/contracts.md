# Contracts & Validation

Agent contracts define expected input/output types and SLA limits. AgentVM validates at runtime.

## Defining a Contract

```typescript
const agent = new Agent({
  name: 'summarizer',
  contract: {
    input: { type: 'string' },
    output: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        wordCount: { type: 'number' },
      },
      required: ['summary'],
    },
    maxLatency: 5000, // warn if > 5 seconds
  },
  handler: async (ctx) => ({
    summary: 'Short version...',
    wordCount: 42,
  }),
});
```

## What Gets Validated

- **Input** — Checked before the handler runs. Throws `ContractValidationError` on mismatch.
- **Output** — Checked after the handler returns. Throws `ContractValidationError` on mismatch.
- **Latency** — If execution exceeds `maxLatency`, the kernel emits a `contract:sla:latency` event.

## Catching Validation Errors

```typescript
import { ContractValidationError } from '@llmhut/agentvm';

try {
  await kernel.execute(proc.id, { task: 'test', input: 42 });
} catch (e) {
  if (e instanceof ContractValidationError) {
    console.log(e.agentName);   // 'summarizer'
    console.log(e.phase);       // 'input'
    console.log(e.violations);  // ['input is number, expected string']
  }
}
```

## Supported Types

`string`, `number`, `boolean`, `object` (with `properties` and `required`), `array` (with `items`). Nested validation is recursive.
