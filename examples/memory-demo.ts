/**
 * Example: Memory Bus
 *
 * Shows isolated per-process memory and shared cross-agent memory.
 *
 * Run: npx tsx examples/memory-demo.ts
 */

import { Kernel, Agent, MemoryBus } from '../src';

async function main() {
  const kernel = new Kernel({ name: 'memory-demo', debug: true });
  const memoryBus = new MemoryBus();

  // Define agents
  const agent1 = new Agent({ name: 'agent-alpha' });
  const agent2 = new Agent({ name: 'agent-beta' });

  kernel.register(agent1, agent2);

  // Spawn processes
  const proc1 = await kernel.spawn('agent-alpha');
  const proc2 = await kernel.spawn('agent-beta');

  // Each process gets isolated memory
  const mem1 = memoryBus.getAccessor(proc1.id);
  const mem2 = memoryBus.getAccessor(proc2.id);

  // Write to isolated memory
  await mem1.set('secret', 'alpha-private-data');
  await mem2.set('secret', 'beta-private-data');

  // Each sees only its own data
  console.log('\n--- Isolated Memory ---');
  console.log(`Alpha's secret: ${await mem1.get('secret')}`);
  console.log(`Beta's secret: ${await mem2.get('secret')}`);

  // Shared memory is accessible to all
  const shared = memoryBus.getSharedAccessor();
  await shared.set('global-config', { model: 'claude-sonnet', temperature: 0.7 });

  console.log('\n--- Shared Memory ---');
  console.log(`Global config: ${JSON.stringify(await shared.get('global-config'))}`);

  // Both processes can read shared memory
  const sharedFromProc1 = memoryBus.getSharedAccessor();
  const sharedFromProc2 = memoryBus.getSharedAccessor();
  console.log(`Alpha reads shared: ${JSON.stringify(await sharedFromProc1.get('global-config'))}`);
  console.log(`Beta reads shared: ${JSON.stringify(await sharedFromProc2.get('global-config'))}`);

  // Memory stats
  console.log('\n--- Memory Stats ---');
  console.log(memoryBus.stats);

  // List keys
  await mem1.set('tasks:1', 'research');
  await mem1.set('tasks:2', 'analyze');
  await mem1.set('tasks:3', 'write');
  console.log(`\nAlpha's task keys: ${await mem1.list('tasks:')}`);

  // Clean up
  memoryBus.deleteNamespace(proc1.id);
  memoryBus.deleteNamespace(proc2.id);
  await kernel.shutdown();

  console.log('\nDone!');
}

main().catch(console.error);
