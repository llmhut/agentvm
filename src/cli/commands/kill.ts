import { info, log, c } from '../utils.js';

export async function killCommand(
  processId: string,
  options: { all: boolean }
): Promise<void> {
  log('');
  info(`The ${c.cyan('kill')} command works inside the AgentVM console.`);
  log('');
  log(`  Start the runtime first:`);
  log(`    ${c.cyan('$')} agentvm start`);
  log('');
  log(`  Then use ${c.cyan('kill <process-id>')} inside the console.`);
  log('');
}
