import { info, log, c } from '../utils.js';

export async function psCommand(options: { all: boolean }): Promise<void> {
  log('');
  info(`The ${c.cyan('ps')} command works inside the AgentVM console.`);
  log('');
  log(`  Start the runtime first:`);
  log(`    ${c.cyan('$')} agentvm start`);
  log('');
  log(`  Then use ${c.cyan('ps')} inside the console to list processes.`);
  log('');
}
