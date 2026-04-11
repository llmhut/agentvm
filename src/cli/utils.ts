import type { ProcessState } from '../core/types.js';

// ── ANSI Colors (no dependency needed) ──

const isColorSupported = process.env.NO_COLOR === undefined && process.stdout.isTTY;

const code = (open: number, close: number) => (str: string) =>
  isColorSupported ? `\x1b[${open}m${str}\x1b[${close}m` : str;

export const c = {
  bold: code(1, 22),
  dim: code(2, 22),
  italic: code(3, 23),
  green: code(32, 39),
  red: code(31, 39),
  yellow: code(33, 39),
  blue: code(34, 39),
  cyan: code(36, 39),
  magenta: code(35, 39),
  gray: code(90, 39),
  white: code(37, 39),
  bgGreen: code(42, 49),
  bgRed: code(41, 49),
  bgYellow: code(43, 49),
  bgBlue: code(44, 49),
};

// ── Symbols ──

export const sym = {
  success: isColorSupported ? '✔' : 'OK',
  error: isColorSupported ? '✖' : 'ERR',
  warning: isColorSupported ? '⚠' : 'WARN',
  info: isColorSupported ? 'ℹ' : 'INFO',
  arrow: isColorSupported ? '→' : '->',
  bullet: isColorSupported ? '•' : '-',
  dot: isColorSupported ? '·' : '.',
};

// ── Logging helpers ──

export function log(msg: string): void {
  console.log(msg);
}

export function success(msg: string): void {
  console.log(`${c.green(sym.success)} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${c.red(sym.error)} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${c.yellow(sym.warning)} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${c.blue(sym.info)} ${msg}`);
}

export function header(title: string): void {
  console.log();
  console.log(c.bold(c.cyan(`  ${title}`)));
  console.log(c.dim(`  ${'─'.repeat(Math.max(title.length, 40))}`));
}

// ── State badge ──

export function stateBadge(state: ProcessState | string): string {
  switch (state) {
    case 'running':
      return c.green(c.bold(' RUNNING '));
    case 'paused':
      return c.yellow(c.bold(' PAUSED  '));
    case 'terminated':
      return c.gray(' STOPPED ');
    case 'crashed':
      return c.red(c.bold(' CRASHED '));
    case 'created':
      return c.blue(' CREATED ');
    case 'starting':
      return c.cyan(' STARTING');
    default:
      return c.gray(` ${state.toUpperCase()} `);
  }
}

// ── Table renderer ──

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? '').length)),
  );

  const divider = colWidths.map((w) => '─'.repeat(w + 2)).join('┼');
  const headerRow = headers.map((h, i) => ` ${c.bold(h.padEnd(colWidths[i]))} `).join('│');

  console.log();
  console.log(`  ${headerRow}`);
  console.log(`  ${c.dim(divider)}`);

  for (const row of rows) {
    const line = row
      .map((cell, i) => {
        const stripped = stripAnsi(cell);
        const padding = colWidths[i] - stripped.length;
        return ` ${cell}${' '.repeat(Math.max(0, padding))} `;
      })
      .join('│');
    console.log(`  ${line}`);
  }

  console.log();
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Duration formatter ──

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── Relative time ──

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
