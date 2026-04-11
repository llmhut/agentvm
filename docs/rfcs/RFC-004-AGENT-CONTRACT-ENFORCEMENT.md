# RFC-004: Agent Contract Enforcement

> **Status:** draft
>
> **Author:** AgentVM Core Team
>
> **Created:** 2026-04-11

## Summary

Runtime enforcement of `AgentContract` — validate that inputs match the declared schema before calling a handler, validate outputs after, and enforce SLA fields (`maxLatency`, `maxCost`) during execution.

## Motivation

`AgentContract` types were introduced in v0.2.1 but are not enforced at runtime. Agents silently receive bad inputs and return unexpected outputs. Without enforcement, typed contracts are documentation-only.

## Detailed Design

### Input Validation

When `Kernel.execute()` is called on an agent with `contract.input` defined, validate `taskInput.input` against the schema before calling the handler:

```typescript
// Proposed: Kernel.execute() pseudocode
if (agent.contract?.input) {
  const error = validateSchema(taskInput.input, agent.contract.input);
  if (error) throw new ContractViolationError(agent.name, 'input', error);
}
```

### Output Validation

After the handler resolves, validate the output against `contract.output`:

```typescript
if (agent.contract?.output) {
  const error = validateSchema(output, agent.contract.output);
  if (error) throw new ContractViolationError(agent.name, 'output', error);
}
```

### SLA Enforcement

- `maxLatency` — wrap the handler call in a `Promise.race()` against a timeout. If exceeded, abort the process and throw a `SLAViolationError`.
- `maxCost` — after execution, compare `result.cost` against `maxCost`. Emit a `sla:cost_exceeded` warning event if over budget (enforcement vs. warning TBD via RFC discussion).

### Pipeline Type Safety

`createPipeline()` should validate at construction time that each agent's `contract.output` type is compatible with the next agent's `contract.input` type:

```typescript
createPipeline(kernel, [researcher, writer]);
// → validate researcher.contract.output.type === writer.contract.input.type
// → throw PipelineTypeError if incompatible
```

### New Error Types

```typescript
class ContractViolationError extends Error {
  constructor(agentName: string, direction: 'input' | 'output', reason: string)
}

class SLAViolationError extends Error {
  constructor(agentName: string, field: 'maxLatency' | 'maxCost', value: number, limit: number)
}
```

## Trade-offs

- **Adds overhead to every execution**: Schema validation on every call. Acceptable for correctness; can be opt-out via `kernel.config.strictContracts: false`.
- **JSON Schema subset only**: We validate against `SchemaDefinition` (our own type), not full JSON Schema. Full JSON Schema support could be added via `ajv` in a future RFC.

## Open Questions

1. Should contract violations crash the process (`crashed`) or just throw without state change?
2. Should `maxCost` be a hard limit (abort) or soft limit (warn)?
3. Should `createPipeline()` enforce contracts at construction or at runtime?

## References

- `src/core/types.ts` — `AgentContract`, `SchemaDefinition`
- `src/core/kernel.ts` — `Kernel.execute()`
- [RFC-001](./RFC-001-PROCESS-STATE-MACHINE.md) — process states
