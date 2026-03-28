import { info, log, c } from '../utils.js';

export async function logsCommand(
  processId: string,
  options: { follow: boolean; lines: string }
): Promise<void> {
  log('');
  info(`The ${c.cyan('logs')} command works inside the AgentVM console.`);
  log('');
  log(`  Start the runtime first:`);
  log(`    ${c.cyan('$')} agentvm start`);
  log('');
  log(`  Then use ${c.cyan('logs <process-id>')} inside the console.`);
  log('');
}
