#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { psCommand } from './commands/ps.js';
import { killCommand } from './commands/kill.js';
import { logsCommand } from './commands/logs.js';

const program = new Command();

program
  .name('agentvm')
  .description('The runtime your AI agents deserve')
  .version('0.1.0-alpha.1');

program
  .command('init [name]')
  .description('Scaffold a new AgentVM project')
  .option('-t, --template <template>', 'Project template', 'default')
  .action(initCommand);

program
  .command('start')
  .description('Start the AgentVM kernel from agentvm.config.ts')
  .option('-c, --config <path>', 'Config file path', 'agentvm.config.ts')
  .option('-d, --debug', 'Enable debug logging', false)
  .action(startCommand);

program
  .command('ps')
  .description('List running agent processes')
  .option('-a, --all', 'Show all processes (including terminated)', false)
  .action(psCommand);

program
  .command('kill <processId>')
  .description('Terminate an agent process')
  .option('--all', 'Terminate all running processes', false)
  .action(killCommand);

program
  .command('logs <processId>')
  .description('Stream events from an agent process')
  .option('-f, --follow', 'Follow mode (stream new events)', false)
  .option('-n, --lines <number>', 'Number of recent events to show', '20')
  .action(logsCommand);

program.parse();
