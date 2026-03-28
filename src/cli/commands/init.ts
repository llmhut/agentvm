import * as fs from 'node:fs';
import * as path from 'node:path';
import { c, success, info, log, sym } from '../utils.js';

export async function initCommand(
  name: string | undefined,
  options: { template: string }
): Promise<void> {
  const projectName = name ?? 'my-agentvm-app';
  const projectDir = path.resolve(process.cwd(), projectName);

  log('');
  log(c.bold(c.cyan('  🔩 AgentVM — Project Scaffolding')));
  log('');

  // Check if directory exists
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      log(c.red(`  Directory "${projectName}" already exists and is not empty.`));
      process.exit(1);
    }
  } else {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Create project structure
  const dirs = ['src', 'src/agents', 'src/tools'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
  }

  // package.json
  writeFile(projectDir, 'package.json', JSON.stringify({
    name: projectName,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      start: 'agentvm start',
      dev: 'agentvm start --debug',
      build: 'tsc',
    },
    dependencies: {
      '@llmhut/agentvm': '^0.1.0',
    },
    devDependencies: {
      typescript: '^5.5.0',
      '@types/node': '^20.0.0',
    },
  }, null, 2));

  // tsconfig.json
  writeFile(projectDir, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
    },
    include: ['src'],
  }, null, 2));

  // agentvm.config.ts
  writeFile(projectDir, 'agentvm.config.ts', `import { Kernel, Agent } from '@llmhut/agentvm';

/**
 * AgentVM Configuration
 *
 * Define your agents, tools, and channels here.
 * Run with: agentvm start
 */

const kernel = new Kernel({
  name: '${projectName}',
  debug: true,
});

// ── Define your agents ──

const greeter = new Agent({
  name: 'greeter',
  description: 'A friendly agent that greets people',
  handler: async (ctx) => {
    const count = ((await ctx.memory.get('count')) as number ?? 0) + 1;
    await ctx.memory.set('count', count);
    ctx.emit('greeted', { input: ctx.input, count });
    return \`Hello, \${ctx.input}! (greeting #\${count})\`;
  },
});

// ── Register agents ──

kernel.register(greeter);

// ── Export the kernel ──

export default kernel;
`);

  // Example agent file
  writeFile(projectDir, 'src/agents/researcher.ts', `import { Agent } from '@llmhut/agentvm';

/**
 * Researcher Agent
 *
 * An example agent that demonstrates memory and tool usage.
 */
export const researcher = new Agent({
  name: 'researcher',
  description: 'Researches topics and stores findings',
  tools: ['search'],
  handler: async (ctx) => {
    // Store the research task
    const history = ((await ctx.memory.get('history')) as string[] ?? []);
    history.push(ctx.input as string);
    await ctx.memory.set('history', history);

    // Use a tool (if registered)
    // const results = await ctx.useTool('search', { query: ctx.input });

    ctx.emit('research:started', { topic: ctx.input });

    return {
      topic: ctx.input,
      findings: \`Research on "\${ctx.input}" completed.\`,
      totalResearched: history.length,
    };
  },
});
`);

  // Example tool file
  writeFile(projectDir, 'src/tools/search.ts', `import type { ToolDefinition } from '@llmhut/agentvm';

/**
 * Search Tool
 *
 * A placeholder search tool. Replace with a real implementation.
 */
export const searchTool: ToolDefinition = {
  name: 'search',
  description: 'Search for information on a topic',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  sideEffects: 'read',
  permission: 'public',
  rateLimit: 30,
  handler: async (params) => {
    const { query } = params as { query: string };
    // Replace with real search implementation
    return {
      results: [
        \`Result 1 for "\${query}"\`,
        \`Result 2 for "\${query}"\`,
      ],
    };
  },
};
`);

  // .gitignore
  writeFile(projectDir, '.gitignore', `node_modules/
dist/
.env
*.log
`);

  // Summary
  log('');
  success('Project created!');
  log('');
  log(`  ${c.dim('Directory')}  ${c.bold(projectName)}/`);
  log(`  ${c.dim('Template')}   ${options.template}`);
  log('');
  log(`  ${c.dim('Files created:')}`);
  log(`    ${sym.bullet} package.json`);
  log(`    ${sym.bullet} tsconfig.json`);
  log(`    ${sym.bullet} agentvm.config.ts`);
  log(`    ${sym.bullet} src/agents/researcher.ts`);
  log(`    ${sym.bullet} src/tools/search.ts`);
  log(`    ${sym.bullet} .gitignore`);
  log('');
  info('Next steps:');
  log('');
  log(`  ${c.cyan('$')} cd ${projectName}`);
  log(`  ${c.cyan('$')} npm install`);
  log(`  ${c.cyan('$')} npx agentvm start --debug`);
  log('');
}

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}
