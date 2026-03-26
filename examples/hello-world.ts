/**
 * Example: Hello World
 *
 * The simplest possible AgentKernel usage — spawn an agent and run it.
 *
 * Run: npx tsx examples/hello-world.ts
 */

import { Kernel, Agent } from '../src';

async function main() {
  // 1. Create a kernel
  const kernel = new Kernel({ name: 'hello-app', debug: true });

  // 2. Define an agent
  const greeter = new Agent({
    name: 'greeter',
    description: 'A friendly agent that says hello',
    handler: async (ctx) => {
      const name = ctx.input as string;
      ctx.emit('greeter:working', { name });
      return `Hello, ${name}! Welcome to AgentKernel.`;
    },
  });

  // 3. Register it
  kernel.register(greeter);

  // 4. Spawn a process
  const process = await kernel.spawn('greeter');
  console.log(`Process spawned: ${process.id} (state: ${process.state})`);

  // 5. Clean up
  await kernel.terminate(process.id);
  console.log(`Process terminated: ${process.id} (state: ${process.state})`);

  await kernel.shutdown();
}

main().catch(console.error);
