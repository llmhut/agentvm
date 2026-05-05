/**
 * Config System — Declarative YAML configuration for AgentVM.
 *
 * Allows defining agents, tools, channels, and kernel settings
 * in a single `agentvm.yml` file instead of writing TypeScript.
 *
 * @example agentvm.yml
 * ```yaml
 * name: my-app
 * debug: false
 * memory:
 *   backend: sqlite
 *   path: ./data/agentvm.db
 *
 * agents:
 *   greeter:
 *     description: A friendly agent
 *     tools: [http_fetch]
 *     memory:
 *       persistent: true
 *     contract:
 *       input: { type: string }
 *       output: { type: string }
 *       maxLatency: 5000
 *
 * tools:
 *   - http_fetch
 *   - json_fetch
 *   - file_read
 *
 * channels:
 *   updates:
 *     type: pubsub
 *     historyLimit: 100
 * ```
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface AgentVMConfig {
  /** Kernel instance name */
  name?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum concurrent processes */
  maxProcesses?: number;

  /** Memory configuration */
  memory?: {
    backend?: 'memory' | 'sqlite';
    path?: string;
  };

  /** Agent declarations */
  agents?: Record<string, AgentYamlConfig>;

  /** Built-in tools to register */
  tools?: string[];

  /** Channel declarations */
  channels?: Record<string, ChannelYamlConfig>;

  /** Environment variable overrides mapping */
  env?: Record<string, string>;
}

export interface AgentYamlConfig {
  description?: string;
  tools?: string[];
  memory?: { persistent?: boolean };
  contract?: {
    input?: { type: string; properties?: Record<string, unknown>; required?: string[] };
    output?: { type: string; properties?: Record<string, unknown>; required?: string[] };
    maxLatency?: number;
    maxCost?: number;
  };
}

export interface ChannelYamlConfig {
  type: 'pubsub' | 'direct' | 'queue';
  historyLimit?: number;
}

export class ConfigValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Config validation failed:\n  ${errors.join('\n  ')}`);
    this.name = 'ConfigValidationError';
  }
}

// ──────────────────────────────────────────────
// YAML Parser (minimal, no dependency)
// ──────────────────────────────────────────────

/**
 * Minimal YAML parser — handles the subset we need for agentvm.yml.
 * Supports: scalars, objects, arrays (flow and block), nested structures.
 * Does NOT support: anchors, tags, multi-doc, complex keys.
 */
export function parseYaml(text: string): unknown {
  const lines = text.split('\n');
  return parseYamlLines(lines, 0, 0).value;
}

interface ParseResult {
  value: unknown;
  endLine: number;
}

function parseYamlLines(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/#.*$/, '').trimEnd(); // strip comments

    // Skip blank / comment-only lines
    if (stripped.trim() === '') {
      i++;
      continue;
    }

    const indent = stripped.length - stripped.trimStart().length;

    // If we've dedented, this block is done
    if (indent < baseIndent) break;
    if (indent > baseIndent && i > startLine) break; // sub-block handled recursively

    const content = stripped.trimStart();

    // Block array item: "- value"
    if (content.startsWith('- ')) {
      // We're in an array context — collect all items at this indent
      const arr: unknown[] = [];
      while (i < lines.length) {
        const aLine = lines[i].replace(/#.*$/, '').trimEnd();
        if (aLine.trim() === '') {
          i++;
          continue;
        }
        const aIndent = aLine.length - aLine.trimStart().length;
        if (aIndent < indent) break;
        if (aIndent > indent) break;

        const aContent = aLine.trimStart();
        if (!aContent.startsWith('- ')) break;

        const itemVal = aContent.slice(2).trim();
        arr.push(parseScalar(itemVal));
        i++;
      }
      return { value: arr, endLine: i };
    }

    // Key: value pair
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = content.slice(0, colonIdx).trim();
    const afterColon = content.slice(colonIdx + 1).trim();

    if (afterColon === '' || afterColon === '|' || afterColon === '>') {
      // Value is on next lines (nested object or block scalar)
      i++;
      if (i < lines.length) {
        const nextLine = lines[i]?.replace(/#.*$/, '').trimEnd() ?? '';
        const nextContent = nextLine.trimStart();
        const nextIndent = nextLine.length - nextContent.length;

        if (nextIndent > indent && nextContent.startsWith('- ')) {
          // Nested array
          const arrResult = parseYamlLines(lines, i, nextIndent);
          result[key] = arrResult.value;
          i = arrResult.endLine;
        } else if (nextIndent > indent) {
          // Nested object
          const nested = parseYamlLines(lines, i, nextIndent);
          result[key] = nested.value;
          i = nested.endLine;
        } else {
          result[key] = null;
        }
      }
    } else {
      // Inline value
      result[key] = parseScalar(afterColon);
      i++;
    }
  }

  return { value: result, endLine: i };
}

function parseScalar(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;

  // Flow array: [a, b, c]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }

  // Flow object: { key: value }
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: Record<string, unknown> = {};
    // Simple k:v parsing (no nested objects in flow)
    for (const pair of inner.split(',')) {
      const ci = pair.indexOf(':');
      if (ci === -1) continue;
      const k = pair.slice(0, ci).trim();
      const v = pair.slice(ci + 1).trim();
      obj[k] = parseScalar(v);
    }
    return obj;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

  // Quoted string
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  return s;
}

// ──────────────────────────────────────────────
// Config Loader
// ──────────────────────────────────────────────

/**
 * Load an AgentVM config from a YAML file.
 *
 * @param filePath — Path to `agentvm.yml`
 * @returns Parsed and validated config
 */
export function loadConfig(filePath: string): AgentVMConfig {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, unknown>;

  // Apply environment variable overrides
  const config = applyEnvOverrides(parsed);

  // Validate
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return config as AgentVMConfig;
}

/**
 * Apply environment variable overrides.
 * The `env` section maps config paths to env var names.
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  const envMap = config.env as Record<string, string> | undefined;
  if (!envMap) return config;

  for (const [configPath, envVar] of Object.entries(envMap)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      setNestedValue(config, configPath, parseScalar(envValue));
    }
  }

  return config;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

/**
 * Validate a parsed config. Returns array of error messages.
 */
export function validateConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (config.name !== undefined && typeof config.name !== 'string') {
    errors.push('`name` must be a string');
  }

  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    errors.push('`debug` must be a boolean');
  }

  if (config.maxProcesses !== undefined) {
    if (typeof config.maxProcesses !== 'number' || config.maxProcesses < 1) {
      errors.push('`maxProcesses` must be a positive number');
    }
  }

  // Memory config
  if (config.memory !== undefined) {
    const mem = config.memory as Record<string, unknown>;
    if (mem.backend && !['memory', 'sqlite'].includes(mem.backend as string)) {
      errors.push('`memory.backend` must be "memory" or "sqlite"');
    }
    if (mem.backend === 'sqlite' && !mem.path) {
      errors.push('`memory.path` is required when backend is "sqlite"');
    }
  }

  // Agents
  if (config.agents !== undefined) {
    if (typeof config.agents !== 'object' || Array.isArray(config.agents)) {
      errors.push('`agents` must be an object mapping agent names to configs');
    } else {
      for (const [name, agentConfig] of Object.entries(config.agents as Record<string, unknown>)) {
        if (typeof agentConfig !== 'object' || agentConfig === null) {
          errors.push(`agents.${name} must be an object`);
        }
      }
    }
  }

  // Tools
  if (config.tools !== undefined && !Array.isArray(config.tools)) {
    errors.push('`tools` must be an array of tool names');
  }

  // Channels
  if (config.channels !== undefined) {
    if (typeof config.channels !== 'object' || Array.isArray(config.channels)) {
      errors.push('`channels` must be an object mapping channel names to configs');
    } else {
      for (const [name, chanConfig] of Object.entries(config.channels as Record<string, unknown>)) {
        const chan = chanConfig as Record<string, unknown>;
        if (!chan.type || !['pubsub', 'direct', 'queue'].includes(chan.type as string)) {
          errors.push(`channels.${name}.type must be "pubsub", "direct", or "queue"`);
        }
      }
    }
  }

  return errors;
}
