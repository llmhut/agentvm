/**
 * Example: Hello World — Full Execute Flow
 *
 * Demonstrates the complete AgentVM lifecycle:
 * spawn → register tools → execute with memory → terminate
 *
 * Run: npx tsx examples/hello-world.ts
 */

import { Kernel, Agent } from '../src';

async function main() {
  // 1. Create a kernel with debug logging
  const kernel = new Kernel({ name: 'hello-app', debug: true });

  // 2. Register a tool
  kernel.registerTool({
    name: 'uppercase',
    description: 'Converts text to uppercase',
    parameters: { type: 'string' },
    sideEffects: 'none',
    permission: 'public',
    handler: async (params) => (params as string).toUpperCase(),
  });

  // 3. Define an agent with a handler
  const greeter = new Agent({
    name: 'greeter',
    description: 'A friendly agent that greets people',
    tools: ['uppercase'],
    handler: async (ctx) => {
      // Use memory to track how many times we've run
      const count = ((await ctx.memory.get('run-count')) as number ?? 0) + 1;
      await ctx.memory.set('run-count', count);

      // Use a tool
      const shoutedName = await ctx.useTool('uppercase', ctx.input);

      // Emit a custom event
      ctx.emit('greeting-sent', { name: ctx.input, count });

      return `Hello, ${shoutedName}! (greeting #${count})`;
    },
  });

  // 4. Register and spawn
  kernel.register(greeter);
  const proc = await kernel.spawn('greeter');

  // 5. Execute tasks — memory persists across executions
  const result1 = await kernel.execute(proc.id, { task: 'Alice' });
  console.log('\nResult 1:', result1.output);
  console.log('Duration:', result1.duration, 'ms');

  const result2 = await kernel.execute(proc.id, { task: 'Bob' });
  console.log('\nResult 2:', result2.output);
  console.log('Duration:', result2.duration, 'ms');

  // 6. Check memory directly
  const mem = kernel.memory.getAccessor(proc.id);
  console.log('\nRun count in memory:', await mem.get('run-count'));

  // 7. Clean up
  await kernel.terminate(proc.id);
  console.log('\nProcess terminated. State:', proc.state);

  await kernel.shutdown();
  console.log('Kernel shut down. Done!');
}

main().catch(console.error);
