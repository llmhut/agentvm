/**
 * Agent Contract Enforcement — Runtime validation of agent inputs and outputs.
 *
 * When an agent defines a `contract` with input/output schemas,
 * the contract validator checks values before and after execution.
 * This catches type mismatches early and provides clear error messages.
 *
 * @example
 * ```ts
 * const agent = new Agent({
 *   name: 'summarizer',
 *   contract: {
 *     input: { type: 'string', description: 'Text to summarize' },
 *     output: { type: 'object', properties: {
 *       summary: { type: 'string' },
 *       wordCount: { type: 'number' },
 *     }},
 *     maxLatency: 5000, // 5 seconds
 *     maxCost: 0.01,    // $0.01
 *   },
 *   handler: async (ctx) => ({
 *     summary: 'Short version...',
 *     wordCount: 42,
 *   }),
 * });
 * ```
 */

import type { SchemaDefinition, AgentContract } from '../core/types';

export class ContractValidationError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly phase: 'input' | 'output',
    public readonly violations: string[],
  ) {
    super(`Contract violation in "${agentName}" (${phase}): ${violations.join('; ')}`);
    this.name = 'ContractValidationError';
  }
}

/**
 * Validate a value against a SchemaDefinition.
 * Returns an array of violation messages (empty = valid).
 */
export function validateSchema(value: unknown, schema: SchemaDefinition, path = ''): string[] {
  const violations: string[] = [];
  const loc = path || 'value';

  if (value === null || value === undefined) {
    violations.push(`${loc} is ${value}, expected ${schema.type}`);
    return violations;
  }

  // Type check
  const actualType = Array.isArray(value) ? 'array' : typeof value;

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      violations.push(`${loc} is ${actualType}, expected array`);
      return violations;
    }
    if (schema.items) {
      (value as unknown[]).forEach((item, i) => {
        violations.push(...validateSchema(item, schema.items!, `${loc}[${i}]`));
      });
    }
  } else if (schema.type === 'object') {
    if (actualType !== 'object') {
      violations.push(`${loc} is ${actualType}, expected object`);
      return violations;
    }

    const obj = value as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          violations.push(`${loc}.${field} is required but missing`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in obj) {
          violations.push(...validateSchema(obj[propName], propSchema, `${loc}.${propName}`));
        }
      }
    }
  } else {
    // Primitive type check
    if (actualType !== schema.type) {
      violations.push(`${loc} is ${actualType}, expected ${schema.type}`);
    }
  }

  return violations;
}

/**
 * Validate input against an agent's contract.
 * Throws ContractValidationError if violations found.
 */
export function validateInput(agentName: string, contract: AgentContract, input: unknown): void {
  if (!contract.input) return;

  const violations = validateSchema(input, contract.input, 'input');
  if (violations.length > 0) {
    throw new ContractValidationError(agentName, 'input', violations);
  }
}

/**
 * Validate output against an agent's contract.
 * Throws ContractValidationError if violations found.
 */
export function validateOutput(agentName: string, contract: AgentContract, output: unknown): void {
  if (!contract.output) return;

  const violations = validateSchema(output, contract.output, 'output');
  if (violations.length > 0) {
    throw new ContractValidationError(agentName, 'output', violations);
  }
}
