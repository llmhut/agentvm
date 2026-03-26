/**
 * Example: Multi-Agent Research Pipeline
 *
 * Demonstrates spawning multiple agents that communicate via the message broker.
 *
 * Run: npx tsx examples/multi-agent.ts
 */

import { Kernel, Agent, MessageBroker } from '../src';

async function main() {
  const kernel = new Kernel({ name: 'research-pipeline', debug: true });
  const broker = new MessageBroker();

  // Create a shared channel for findings
  broker.createChannel({
    name: 'findings',
    type: 'pubsub',
    historyLimit: 50,
  });

  // Define agents
  const researcher = new Agent({
    name: 'researcher',
    description: 'Gathers raw information on a topic',
  });

  const analyst = new Agent({
    name: 'analyst',
    description: 'Analyzes research findings and extracts insights',
  });

  const writer = new Agent({
    name: 'writer',
    description: 'Writes a polished report from analyzed insights',
  });

  // Register all agents
  kernel.register(researcher, analyst, writer);

  // Spawn processes
  const researcherProc = await kernel.spawn('researcher');
  const analystProc = await kernel.spawn('analyst');
  const writerProc = await kernel.spawn('writer');

  // Set up message flow
  const messages: string[] = [];

  broker.subscribe('findings', analystProc.id, (msg) => {
    messages.push(`[Analyst] Received from ${msg.from}: ${JSON.stringify(msg.data)}`);
  });

  broker.subscribe('findings', writerProc.id, (msg) => {
    messages.push(`[Writer] Received from ${msg.from}: ${JSON.stringify(msg.data)}`);
  });

  // Researcher publishes findings
  broker.publish('findings', researcherProc.id, {
    topic: 'AI Agents',
    findings: [
      'Multi-agent systems outperform single agents on complex tasks',
      'Memory is the biggest bottleneck in current frameworks',
      'Tool use is becoming standardized via MCP',
    ],
  });

  // Log what happened
  console.log('\n--- Message Flow ---');
  messages.forEach((m) => console.log(m));

  console.log('\n--- Broker Stats ---');
  console.log(broker.stats);

  console.log('\n--- Channel History ---');
  const channel = broker.getChannel('findings');
  console.log(`Messages in "findings": ${channel?.history.length}`);

  // Clean up
  await kernel.shutdown();
  console.log('\nDone!');
}

main().catch(console.error);
