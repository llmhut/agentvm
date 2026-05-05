/**
 * AgentVM — Core Type Definitions
 *
 * All shared types, interfaces, and enums live here.
 * This is the contract that all modules depend on.
 */

// ──────────────────────────────────────────────
// Process Types
// ──────────────────────────────────────────────

export enum ProcessState {
  Created = 'created',
  Starting = 'starting',
  Running = 'running',
  Paused = 'paused',
  Terminated = 'terminated',
  Crashed = 'crashed',
}

export interface ProcessInfo {
  id: string;
  agentName: string;
  state: ProcessState;
  createdAt: Date;
  startedAt?: Date;
  terminatedAt?: Date;
  metadata: Record<string, unknown>;
}

export interface ProcessOptions {
  /** Custom process ID (auto-generated if not provided) */
  id?: string;
  /** Initial metadata attached to the process */
  metadata?: Record<string, unknown>;
  /** Maximum execution time in milliseconds */
  timeout?: number;
  /** Maximum memory usage in bytes */
  memoryLimit?: number;
  /** Maximum total tokens this process can consume */
  tokenBudget?: number;
}

// ──────────────────────────────────────────────
// Agent Types
// ──────────────────────────────────────────────

export interface AgentConfig {
  /** Unique agent name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Tool names this agent can access */
  tools?: string[];
  /** Memory configuration */
  memory?: MemoryConfig;
  /** Input/output contract */
  contract?: AgentContract;
  /** Agent handler function */
  handler?: AgentHandler;
}

export interface AgentContract {
  input?: SchemaDefinition;
  output?: SchemaDefinition;
  /** Expected max latency in ms */
  maxLatency?: number;
  /** Expected max cost per execution in USD */
  maxCost?: number;
}

export interface SchemaDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  properties?: Record<string, SchemaDefinition>;
  items?: SchemaDefinition;
  required?: string[];
}

export type AgentHandler = (context: ExecutionContext) => Promise<unknown>;

// ──────────────────────────────────────────────
// Execution Types
// ──────────────────────────────────────────────

export interface ExecutionContext {
  /** Process ID */
  processId: string;
  /** Agent name */
  agentName: string;
  /** Task input */
  input: unknown;
  /** Access to working memory */
  memory: MemoryAccessor;
  /** Tool invocation */
  useTool: (toolName: string, params: unknown) => Promise<unknown>;
  /** Publish a message to a channel */
  publish: (channel: string, data: unknown) => void;
  /** Emit a structured event */
  emit: (event: string, data?: unknown) => void;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

export interface ExecutionResult {
  processId: string;
  agentName: string;
  output: unknown;
  duration: number;
  tokensUsed?: number;
  cost?: number;
  events: KernelEvent[];
}

export interface TaskInput {
  task: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Memory Types
// ──────────────────────────────────────────────

export interface MemoryConfig {
  /** Enable persistent memory across sessions */
  persistent?: boolean;
  /** Memory backend to use */
  backend?: 'memory' | 'sqlite' | 'redis' | 'postgres';
  /** Namespace for memory isolation */
  namespace?: string;
}

export interface MemoryAccessor {
  get: (key: string) => Promise<unknown | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
  list: (prefix?: string) => Promise<string[]>;
  clear: () => Promise<void>;
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  namespace: string;
  createdAt: Date;
  updatedAt: Date;
  ttl?: number;
}

// ──────────────────────────────────────────────
// Tool Types
// ──────────────────────────────────────────────

export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for parameters */
  parameters: SchemaDefinition;
  /** Side effect classification */
  sideEffects: 'none' | 'read' | 'write' | 'execute';
  /** Permission level required */
  permission: 'public' | 'restricted' | 'admin';
  /** Rate limit (calls per minute) */
  rateLimit?: number;
  /** The handler function */
  handler: (params: unknown, context: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  /** Agent invoking the tool */
  agentName: string;
  /** Process invoking the tool */
  processId: string;
  /** Abort signal */
  signal: AbortSignal;
}

// ──────────────────────────────────────────────
// Message Broker Types
// ──────────────────────────────────────────────

export interface ChannelConfig {
  /** Channel name */
  name: string;
  /** Channel type */
  type: 'pubsub' | 'direct' | 'queue';
  /** Message schema (optional validation) */
  schema?: SchemaDefinition;
  /** Maximum messages retained in history */
  historyLimit?: number;
}

export interface Message<T = unknown> {
  id: string;
  channel: string;
  from: string;
  data: T;
  timestamp: Date;
  priority?: number;
}

export type MessageHandler<T = unknown> = (message: Message<T>) => void | Promise<void>;

// ──────────────────────────────────────────────
// Scheduler Types
// ──────────────────────────────────────────────

export type SchedulerStrategy = 'sequential' | 'parallel' | 'conditional' | 'race';

export interface TaskDefinition {
  id: string;
  agentName: string;
  input: unknown;
  /** Tasks that must complete before this one */
  dependsOn?: string[];
  /** Priority (higher = sooner) */
  priority?: number;
  /** Retry policy */
  retry?: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: 'fixed' | 'exponential';
  delayMs: number;
}

// ──────────────────────────────────────────────
// Event Types
// ──────────────────────────────────────────────

export interface KernelEvent {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  data?: unknown;
}

export type EventHandler = (event: KernelEvent) => void | Promise<void>;

// ──────────────────────────────────────────────
// Kernel Configuration
// ──────────────────────────────────────────────

export interface KernelConfig {
  /** Kernel instance name */
  name?: string;
  /** Default memory backend (string name for built-in, or a MemoryBackend instance) */
  memoryBackend?: 'memory' | 'sqlite' | 'redis' | 'postgres' | unknown;
  /** Maximum concurrent processes */
  maxProcesses?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Event handlers */
  on?: Record<string, EventHandler>;
}
