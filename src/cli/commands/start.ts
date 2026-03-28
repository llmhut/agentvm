import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { c, success, info, warn, error, log, header, stateBadge, sym, table, formatDuration } from '../utils.js';
import type { Kernel } from '../../core/kernel.js';

export async function startCommand(options: { config: string; debug: boolean }): Promise<void> {
  const configPath = path.resolve(process.cwd(), options.config);

  log('');
  log(c.bold(c.cyan('  🔩 AgentVM Runtime')));
  log('');

  // Check config file exists
  if (!fs.existsSync(configPath)) {
    error(`Config file not found: ${options.config}`);
    log('');
    info(`Run ${c.cyan('agentvm init')} to create a new project, or specify a config with ${c.cyan('--config')}`);
    process.exit(1);
  }

  // Load the config module
  info(`Loading config from ${c.dim(options.config)}`);

  let kernel: Kernel;
  try {
    const mod = await import(configPath);
    kernel = mod.default;

    if (!kernel || typeof kernel.spawn !== 'function') {
      error('Config file must export a Kernel instance as default export.');
      process.exit(1);
    }
  } catch (err) {
    error(`Failed to load config: ${(err as Error).message}`);
    process.exit(1);
  }

  // Kernel info
  success(`Kernel "${c.bold(kernel.name)}" loaded`);
  log(`  ${c.dim('Agents registered:')} ${kernel.agents.length}`);

  for (const agent of kernel.agents) {
    log(`    ${sym.bullet} ${c.bold(agent.name)} ${c.dim(agent.description || '(no description)')}`);
  }

  log('');

  // Event logging in debug mode
  if (options.debug) {
    kernel.onAny((event) => {
      const ts = new Date().toISOString().slice(11, 23);
      const data = event.data ? c.dim(` ${JSON.stringify(event.data)}`) : '';
      log(`  ${c.gray(ts)} ${c.magenta(event.type)}${data}`);
    });
    info('Debug mode enabled — all events will be logged');
    log('');
  }

  // Interactive REPL
  header('AgentVM Console');
  log(`  Type ${c.cyan('help')} for available commands, ${c.cyan('exit')} to quit.`);
  log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan('agentvm> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    const [cmd, ...args] = input.split(/\s+/);

    try {
      switch (cmd) {
        case 'help':
          printHelp();
          break;

        case 'spawn': {
          const agentName = args[0];
          if (!agentName) {
            warn('Usage: spawn <agent-name>');
            break;
          }
          const proc = await kernel.spawn(agentName);
          success(`Spawned process ${c.bold(proc.id)}`);
          break;
        }

        case 'exec':
        case 'execute': {
          const [procId, ...taskParts] = args;
          if (!procId || taskParts.length === 0) {
            warn('Usage: exec <process-id> <task>');
            break;
          }
          const task = taskParts.join(' ');
          const result = await kernel.execute(procId, { task });
          success(`Completed in ${formatDuration(result.duration)}`);
          log(`  ${c.dim('Output:')} ${JSON.stringify(result.output)}`);
          break;
        }

        case 'ps': {
          const showAll = args.includes('--all') || args.includes('-a');
          const processes = showAll
            ? kernel.getProcesses()
            : kernel.getProcesses({ active: true });

          if (processes.length === 0) {
            info('No processes running.');
            break;
          }

          const rows = processes.map((p) => [
            c.bold(p.id),
            p.agentName,
            stateBadge(p.state),
            p.info.startedAt ? new Date(p.info.startedAt).toISOString().slice(11, 19) : '-',
          ]);

          table(['Process ID', 'Agent', 'State', 'Started'], rows);
          break;
        }

        case 'kill': {
          const pid = args[0];
          if (!pid) {
            warn('Usage: kill <process-id>');
            break;
          }
          if (pid === '--all') {
            await kernel.shutdown();
            success('All processes terminated.');
          } else {
            await kernel.terminate(pid);
            success(`Process ${c.bold(pid)} terminated.`);
          }
          break;
        }

        case 'pause': {
          const pid = args[0];
          if (!pid) { warn('Usage: pause <process-id>'); break; }
          await kernel.pause(pid);
          success(`Process ${c.bold(pid)} paused.`);
          break;
        }

        case 'resume': {
          const pid = args[0];
          if (!pid) { warn('Usage: resume <process-id>'); break; }
          await kernel.resume(pid);
          success(`Process ${c.bold(pid)} resumed.`);
          break;
        }

        case 'logs': {
          const pid = args[0];
          if (!pid) { warn('Usage: logs <process-id>'); break; }
          const proc = kernel.getProcess(pid);
          if (!proc) { error(`Process "${pid}" not found.`); break; }
          const events = proc.events.slice(-20);
          if (events.length === 0) {
            info('No events recorded.');
            break;
          }
          for (const e of events) {
            const ts = e.timestamp.toISOString().slice(11, 23);
            const data = e.data ? c.dim(` ${JSON.stringify(e.data)}`) : '';
            log(`  ${c.gray(ts)} ${c.magenta(e.type)}${data}`);
          }
          break;
        }

        case 'agents': {
          const agents = kernel.agents;
          if (agents.length === 0) {
            info('No agents registered.');
            break;
          }
          const rows = agents.map((a) => [
            c.bold(a.name),
            a.description || c.dim('(none)'),
            a.tools.length > 0 ? a.tools.join(', ') : c.dim('(none)'),
            a.handler ? c.green('yes') : c.red('no'),
          ]);
          table(['Name', 'Description', 'Tools', 'Handler'], rows);
          break;
        }

        case 'stats': {
          const memStats = kernel.memory.stats;
          const brokerStats = kernel.broker.stats;
          const toolCount = kernel.tools.tools.length;
          const activeProcs = kernel.getProcesses({ active: true }).length;

          header('Runtime Stats');
          log(`  ${c.dim('Active processes:')} ${c.bold(String(activeProcs))}`);
          log(`  ${c.dim('Registered agents:')} ${c.bold(String(kernel.agents.length))}`);
          log(`  ${c.dim('Registered tools:')} ${c.bold(String(toolCount))}`);
          log(`  ${c.dim('Memory namespaces:')} ${c.bold(String(memStats.namespaces))}`);
          log(`  ${c.dim('Memory entries:')} ${c.bold(String(memStats.totalEntries))}`);
          log(`  ${c.dim('Broker channels:')} ${c.bold(String(brokerStats.channels))}`);
          log(`  ${c.dim('Messages sent:')} ${c.bold(String(brokerStats.totalMessages))}`);
          log('');
          break;
        }

        case 'exit':
        case 'quit':
          info('Shutting down...');
          await kernel.shutdown();
          success('Kernel shut down. Goodbye!');
          rl.close();
          process.exit(0);
          break;

        default:
          warn(`Unknown command: ${cmd}. Type ${c.cyan('help')} for available commands.`);
      }
    } catch (err) {
      error((err as Error).message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function printHelp(): void {
  header('Available Commands');
  const cmds = [
    ['spawn <agent>', 'Spawn a new agent process'],
    ['exec <pid> <task>', 'Execute a task on a process'],
    ['ps [-a]', 'List processes (-a for all)'],
    ['kill <pid>', 'Terminate a process'],
    ['kill --all', 'Terminate all processes'],
    ['pause <pid>', 'Pause a process'],
    ['resume <pid>', 'Resume a paused process'],
    ['logs <pid>', 'Show recent events for a process'],
    ['agents', 'List registered agents'],
    ['stats', 'Show runtime statistics'],
    ['help', 'Show this help'],
    ['exit', 'Shut down and exit'],
  ];

  for (const [cmd, desc] of cmds) {
    log(`  ${c.cyan(cmd.padEnd(22))} ${c.dim(desc)}`);
  }
  log('');
}
