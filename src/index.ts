/**
 * AgentKernel — The runtime your AI agents deserve.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { Kernel, Agent } from 'agentkernel';
 *
 * const kernel = new Kernel();
 * const agent = new Agent({ name: 'my-agent' });
 *
 * kernel.register(agent);
 * const process = await kernel.spawn('my-agent');
 * ```
 */

// Core
export { Kernel } from './core/kernel';
export { Agent } from './core/agent';
export { Process } from './core/process';

// Memory
export { MemoryBus } from './memory/bus';

// Tools
export { ToolRouter, ToolNotFoundError, ToolExecutionError, ToolRateLimitError } from './tools/router';

// Broker
export { MessageBroker } from './broker/broker';

// Scheduler
export { Scheduler } from './scheduler/scheduler';

// Types
export type {
  // Core
  KernelConfig,
  AgentConfig,
  AgentContract,
  AgentHandler,
  ProcessInfo,
  ProcessOptions,
  ProcessState,
  SchemaDefinition,

  // Execution
  ExecutionContext,
  ExecutionResult,
  TaskInput,

  // Memory
  MemoryConfig,
  MemoryAccessor,
  MemoryEntry,

  // Tools
  ToolDefinition,
  ToolContext,

  // Broker
  ChannelConfig,
  Message,
  MessageHandler,

  // Scheduler
  SchedulerStrategy,
  TaskDefinition,
  RetryPolicy,

  // Events
  KernelEvent,
  EventHandler,
} from './core/types';
