#!/usr/bin/env npx tsx
/**
 * AgentVM Sample App — Research & Write
 *
 * A complete end-to-end application demonstrating how AgentVM works.
 *
 * Three agents collaborate on a content pipeline:
 *   Researcher → Writer → Fact-Checker
 *
 * Features used:
 *   ✅ Kernel + Agent + Process lifecycle
 *   ✅ SQLite memory backend (persistent across runs)
 *   ✅ Built-in tools (http_fetch) + custom tools (extract_text)
 *   ✅ Agent contracts (input/output validation)
 *   ✅ Message broker (status channel)
 *   ✅ Checkpointing (save/restore)
 *   ✅ Kernel.stats() (resource tracking)
 *   ✅ createLLMAgent() (real AI mode)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx app.ts "Your topic here"
 *   npx tsx app.ts --mock "Your topic here"      # no API key needed
 *   npx tsx app.ts --mock --debug "Your topic"    # verbose logging
 */

import * as fs from 'node:fs';
import { createKernel, type AppConfig } from './config';
import { createAgents } from './agents';
import { checkpoint, restore } from '../../src/checkpoint/checkpoint';

// ──────────────────────────────────────────────
// Parse CLI args
// ──────────────────────────────────────────────

const args = process.argv.slice(2);
const mock = args.includes('--mock');
const debug = args.includes('--debug');
const resumeFlag = args.includes('--resume');
const topic = args.filter((a) => !a.startsWith('--')).join(' ') || 'The future of AI agents';

const appConfig: AppConfig = { mock, debug };

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  🔩 AgentVM Sample App — Research & Write');
  console.log('  ─'.repeat(30));
  console.log(`  📋 Topic:  ${topic}`);
  console.log(`  🤖 Mode:   ${mock ? 'Mock (no API key)' : 'Real LLM (Anthropic Claude)'}`);
  console.log(`  💾 Memory: SQLite (./sample-app-data.db)`);
  console.log('');

  // ── Step 1: Create kernel with SQLite memory ──

  const { kernel, backend } = await createKernel(appConfig);
  console.log('  ✅ Kernel created with SQLite backend');

  // ── Step 2: Create and register agents ──

  const { researcher, writer, factChecker } = createAgents(appConfig);
  kernel.register(researcher, writer, factChecker);
  console.log(`  ✅ ${kernel.agents.length} agents registered: ${kernel.agents.map((a) => a.name).join(', ')}`);
  console.log(`  ✅ ${kernel.tools.tools.length} tools available: ${kernel.tools.tools.map((t) => t.name).join(', ')}`);
  console.log('');

  // ── Step 3: Check for resume from checkpoint ──

  const checkpointDir = './checkpoints';
  const cpPath = `${checkpointDir}/researcher.json`;

  if (resumeFlag && fs.existsSync(cpPath)) {
    console.log('  🔄 Resuming from checkpoint...');
    try {
      const proc = await restore(kernel, cpPath);
      console.log(`  ✅ Restored process ${proc.id}`);

      const history = await kernel.memory.getAccessor(proc.id).get('research_history');
      console.log(`  📚 Previous research count: ${(history as string[])?.length ?? 0}`);
      console.log('');
    } catch (err) {
      console.log(`  ⚠️  Checkpoint restore failed: ${(err as Error).message}`);
      console.log('  Starting fresh instead.\n');
    }
  }

  // ── Step 4: Run the pipeline ──

  console.log('  ═'.repeat(30));
  console.log('  📡 PIPELINE START');
  console.log('  ═'.repeat(30));
  console.log('');

  const pipeline = [
    { agent: researcher, label: '🔬 RESEARCHER', color: '\x1b[36m' },
    { agent: writer, label: '✍️  WRITER', color: '\x1b[33m' },
    { agent: factChecker, label: '🔍 FACT-CHECKER', color: '\x1b[35m' },
  ];

  let currentInput: string = topic;
  const results: { agent: string; output: string; duration: number }[] = [];

  for (const step of pipeline) {
    const reset = '\x1b[0m';
    console.log(`${step.color}  ┌─ ${step.label} ────────────────────────────${reset}`);
    console.log(`${step.color}  │ Input: ${currentInput.slice(0, 80)}${currentInput.length > 80 ? '...' : ''}${reset}`);

    const startTime = Date.now();
    const proc = await kernel.spawn(step.agent.name);

    try {
      const result = await kernel.execute(proc.id, {
        task: currentInput,
        input: currentInput,
      });

      const duration = Date.now() - startTime;
      const output = result.output as string;

      results.push({ agent: step.agent.name, output, duration });

      console.log(`${step.color}  │ Duration: ${duration}ms${result.tokensUsed ? ` | Tokens: ${result.tokensUsed}` : ''}${reset}`);
      console.log(`${step.color}  │ Output: ${output.slice(0, 100)}${output.length > 100 ? '...' : ''}${reset}`);
      console.log(`${step.color}  └──────────────────────────────────────────${reset}`);
      console.log('');

      // Save checkpoint after researcher
      if (step.agent.name === 'researcher') {
        try {
          if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });
          await checkpoint(kernel, proc.id, cpPath);
          console.log(`  💾 Checkpoint saved: ${cpPath}`);
          console.log('');
        } catch {
          // Non-critical
        }
      }

      // Feed output to next agent
      currentInput = output;
    } catch (err) {
      console.log(`${step.color}  │ ❌ ERROR: ${(err as Error).message}${reset}`);
      console.log(`${step.color}  └──────────────────────────────────────────${reset}`);
      console.log('');
      break;
    }
  }

  // ── Step 5: Print final output ──

  console.log('  ═'.repeat(30));
  console.log('  📄 FINAL RESULTS');
  console.log('  ═'.repeat(30));
  console.log('');

  // Print the article (writer output)
  const article = results.find((r) => r.agent === 'writer');
  if (article) {
    console.log(article.output);
    console.log('');
  }

  // Print the fact-check review
  const review = results.find((r) => r.agent === 'fact-checker');
  if (review) {
    console.log('  ─'.repeat(30));
    console.log('  📋 FACT-CHECK REVIEW:');
    console.log('');
    try {
      const parsed = JSON.parse(review.output);
      console.log(`  Score:   ${parsed.score}/10`);
      console.log(`  Verdict: ${parsed.verdict.toUpperCase()}`);
      if (parsed.issues?.length > 0) {
        console.log('  Issues:');
        for (const issue of parsed.issues) {
          console.log(`    ⚠️  ${issue}`);
        }
      }
      if (parsed.suggestions?.length > 0) {
        console.log('  Suggestions:');
        for (const suggestion of parsed.suggestions) {
          console.log(`    💡 ${suggestion}`);
        }
      }
    } catch {
      console.log(review.output);
    }
    console.log('');
  }

  // ── Step 6: Print kernel stats ──

  const stats = await kernel.stats();
  console.log('  ─'.repeat(30));
  console.log('  📊 KERNEL STATS:');
  console.log(`    Agents:     ${stats.agents}`);
  console.log(`    Processes:  ${stats.processes.total} (${stats.processes.active} active)`);
  console.log(`    Memory:     ${stats.memory.backend} backend, ${stats.memory.totalEntries} entries`);
  console.log(`    Tools:      ${stats.tools}`);
  console.log(`    Channels:   ${stats.channels}`);
  console.log(`    Tokens:     ${stats.tokens}`);
  console.log('');

  // Pipeline duration
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`  ⏱️  Total pipeline time: ${totalDuration}ms`);

  // ── Cleanup ──

  await backend.close();
  console.log('  ✅ Done.\n');
}

main().catch((err) => {
  console.error('\n  ❌ Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
