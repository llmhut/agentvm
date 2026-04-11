/**
 * AgentVM — The runtime your AI agents deserve.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { Kernel, Agent } from '@llmhut/agentvm';
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
export {
  ToolRouter,
  ToolNotFoundError,
  ToolExecutionError,
  ToolRateLimitError,
} from './tools/router';

// Broker
export { MessageBroker } from './broker/broker';

// Scheduler
export { Scheduler } from './scheduler/scheduler';

// MCP
export { MCPClient } from './mcp/client';

// Built-in Tools
export {
  httpFetchTool,
  jsonFetchTool,
  shellExecTool,
  fileReadTool,
  fileWriteTool,
  waitTool,
  builtinTools,
  registerBuiltins,
} from './builtins/tools';

// LLM Agent
export { createLLMAgent, createPipeline } from './llm/agent';

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

// MCP Types
export type { MCPServerConfig, MCPTool, MCPResource } from './mcp/client';

// LLM Types
export type { LLMAgentConfig, LLMMessage, LLMResponse } from './llm/agent';
