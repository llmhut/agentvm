# Changelog

All notable changes to AgentVM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet — v0.3.0 is the current release.

---

## [0.3.0] — 2026-05-05

### Added
- **Pluggable Memory Backends**
  - `MemoryBackend` interface — 8-method contract (`get`, `set`, `delete`, `list`, `clear`, `deleteNamespace`, `stats`, `close`)
  - `InMemoryBackend` — refactored default backend, fully backward compatible
  - `SqliteBackend` — file-based persistence using sql.js (pure WASM, no native bindings)
    - `SqliteBackend.create('./data.db')` — async factory, loads existing DB or creates new
    - Auto-flush dirty writes to disk every 5 seconds
    - `flush()` for manual persistence, `close()` for graceful shutdown
  - `MemoryBus` now accepts any `MemoryBackend` via constructor
  - `MemoryBus.statsAsync()` — full async stats from the backend
  - `MemoryBus.close()` — flush and release backend resources
- **Agent Contract Enforcement**
  - `validateSchema()` — recursive schema validator for `string`, `number`, `boolean`, `object`, `array` with nested `properties`, `required`, and `items`
  - `validateInput()` / `validateOutput()` — called automatically in `Kernel.execute()` when agent has a `contract`
  - `ContractValidationError` — thrown with agent name, phase (`input`/`output`), and violation details
  - SLA enforcement — `Kernel.execute()` emits `contract:sla:latency` event when execution exceeds `contract.maxLatency`
- **YAML Config System**
  - `loadConfig('agentvm.yml')` — parse, validate, and return typed `AgentVMConfig`
  - Built-in YAML parser (zero dependencies) — handles nested objects, arrays (block + flow), scalars, comments
  - `validateConfig()` — checks types, required fields, valid enums; returns array of error messages
  - `ConfigValidationError` with all violations listed
  - Environment variable overrides via `env:` section in YAML
- **Checkpointing**
  - `checkpoint(kernel, processId, path)` — serialize process metadata + full memory snapshot to JSON
  - `restore(kernel, path)` — spawn a new process and restore all memory from checkpoint file
  - `readCheckpoint(path)` — inspect checkpoint data without restoring
- **Resource Tracking & Kernel Stats**
  - `ExecutionResult.tokensUsed` — automatically populated from `__llm_usage` in process memory
  - `Kernel.stats()` — aggregate stats: agents, processes by state, memory backend info, tools, channels, total tokens
- `ProcessOptions.tokenBudget` — type added for per-process token limits
- `KernelConfig.memoryBackend` — pass a `MemoryBackend` instance to the kernel constructor
- New type exports: `MemoryBackend`, `MemoryBackendStats`, `AgentVMConfig`, `CheckpointData`, `KernelStats`
- 80 new unit tests (299 total across 8 test files)

### Changed
- `MemoryBus` — rewritten to use `MemoryBackend` interface internally (backward compatible API)
- `Kernel` constructor — accepts `memoryBackend` in config, passes it to `MemoryBus`
- `Kernel.execute()` — now validates input/output contracts, tracks resource usage, checks SLA latency
- `src/index.ts` — exports config, checkpoint, and all new backend modules

### Dependencies
- Added `sql.js` (pure WASM SQLite) as optional dependency for `SqliteBackend`

---

## [0.2.2] — 2026-04-11

### Added
- `MCPClient` — connect to MCP servers over stdio or SSE transport, auto-discover and register tools
  - Full JSON-RPC 2.0 message passing with timeout handling
  - Tool auto-registration: discovered tools appear in the `ToolRouter` as `mcp:<server>:<tool>`
  - Resource discovery via `resources/list`
  - `connect()`, `disconnect()`, `disconnectAll()`, `callTool()`, `readResource()` API
- `createLLMAgent()` factory — create AI agents backed by Anthropic or OpenAI models
  - Full agentic tool-use loop (up to `maxTurns`, default 10)
  - Conversation history persisted in process memory across executions
  - Token usage tracking in `__llm_usage` memory key
  - `onBeforeCall`, `onAfterCall`, `onToolCall` hooks
  - Both Anthropic (`claude-*`) and OpenAI (`gpt-*`) provider support
- `createPipeline()` — chain agents sequentially; each agent's output feeds the next
- Built-in tools (`src/builtins/tools.ts`) — practical tools ready to register:
  - `http_fetch` — HTTP GET/POST/etc with headers, body, timeout (60 req/min)
  - `json_fetch` — fetch + auto-parse JSON response
  - `shell_exec` — run shell commands, returns `{ stdout, stderr, exitCode }`
  - `file_read` — read files with size limit guard
  - `file_write` — write/append files, creates parent directories
  - `wait` — sleep for N milliseconds (capped at 60s, respects AbortSignal)
  - `registerBuiltins(kernel)` convenience function
- Kernel injects `__tool_schemas` into process memory at spawn time so LLM agents can discover tool definitions
- New example projects: `llm-pipeline.ts` (researcher → writer → editor chain), `mcp-agent.ts` (filesystem MCP server integration), `llm-research-agent.ts`
- MCP types exported: `MCPServerConfig`, `MCPTool`, `MCPResource`
- LLM types exported: `LLMAgentConfig`, `LLMMessage`, `LLMResponse`
- Unit tests for LLM agent (`tests/unit/llm.test.ts`) and MCP client (`tests/unit/mcp.test.ts`, `tests/unit/mcp-stdio.test.ts`)
- Fake MCP server fixture for integration testing (`tests/fixtures/fake-mcp-server.mjs`)
- RFC-002 (Memory Bus Interface Contract) — accepted
- RFC-003 (Event Schema Specification) — accepted

### Changed
- `src/index.ts` — `MCPClient`, `createLLMAgent`, `createPipeline`, and all builtin tools now exported from the package root
- `ExecutionContext.signal` — AbortSignal now threaded through to builtin tool handlers for cancellation support

---

## [0.2.1] — 2026-04-05

### Added
- `ToolRouter.getAvailableTools(allowedToolNames)` — filter registered tools by an allowlist
- `Kernel.registerTool()` convenience method (wraps `kernel.tools.register()` and emits `tool:registered`)
- `Kernel.createChannel()` convenience method (wraps `kernel.broker.createChannel()` and emits `channel:created`)
- `AgentContract` interface — typed input/output contracts with `maxLatency` and `maxCost` SLA fields (types defined, runtime enforcement in v0.3.0)
- `MemoryBus.stats` — returns `{ namespaces, totalEntries }`
- `MessageBroker.stats` — returns `{ channels, totalMessages }`
- `Scheduler.stats` — returns `{ queued, running, completed, failed }`

### Fixed
- `Process._terminate()` is now idempotent — calling it twice no longer throws
- `Kernel.terminate()` cleans up process memory namespace when `agent.memory.persistent` is false
- `ToolRouter` rate limiter key now scoped per `toolName:agentName` to prevent cross-agent bleed

---

## [0.2.0] — 2026-03-31

### Added
- `ToolRouter` — central tool registry with registration, invocation, and per-tool rate limiting
  - `register()`, `unregister()`, `getTool()`, `invoke()`, `getAvailableTools()`
  - `ToolNotFoundError`, `ToolExecutionError`, `ToolRateLimitError` error classes
  - Per-tool `rateLimit` (calls/minute), per-agent counter scoping
- `MessageBroker` — inter-agent communication with pub/sub and direct channels
  - `createChannel()`, `deleteChannel()`, `publish()`, `subscribe()`, `sendDirect()`
  - Channel history with configurable `historyLimit`
  - Direct channel auto-creation (`__direct__:a:b` naming)
  - Subscriber errors caught — bad handlers don't break delivery
- `Scheduler` — multi-strategy task execution engine
  - `sequential` — dependency-ordered, fail-fast
  - `parallel` — layer-based parallel execution respecting `dependsOn`
  - `race` — first-to-finish wins
  - `conditional` — stop on falsy result
  - `enqueue()` / `enqueueAll()` with priority sorting
  - Retry policies: `fixed` and `exponential` backoff with `maxAttempts`
  - Circular dependency detection
- `Kernel.execute()` — execute a task on a running process via `ExecutionContext`
  - `ctx.memory` — scoped `MemoryAccessor` for the process
  - `ctx.useTool()` — invoke tools with agent permission enforcement
  - `ctx.publish()` — publish to broker channels
  - `ctx.emit()` — emit custom `agent:<event>` events
  - `ctx.signal` — AbortSignal for cancellation
  - Agent tool allowlist enforcement: undeclared tools are blocked
  - Execution metadata stored on process (`lastExecution`)
  - Process transitions to `crashed` on unhandled handler errors
- CLI commands: `agentvm init`, `agentvm start`, `agentvm spawn`, `agentvm ps`, `agentvm kill`, `agentvm logs`
- `MemoryBus.getSharedAccessor()` — cross-process shared memory namespace
- `MemoryEntry` TTL support — expired entries auto-deleted on `get()`
- `Process.signal` — `AbortSignal` automatically aborted on terminate/crash
- `Process.getMetadata()` / `setMetadata()` — per-process key-value metadata store
- `Process.info` — immutable `ProcessInfo` snapshot (deep-copied metadata)
- `Kernel.getProcesses()` filter — by `agentName`, `state`, or `active` (running + paused)
- `Kernel.shutdown()` — terminates all active processes
- `Kernel.onAny()` — subscribe to all events with a wildcard handler
- `Kernel.debug` mode — logs all emitted events to `console.warn`

---

## [0.1.0] — 2026-03-26

### Added
- Initial project scaffolding — TypeScript, tsup, vitest, ESLint, Prettier, husky
- `Kernel` class — agent registry, process lifecycle, event system
- `Agent` class — typed agent definitions with name validation
- `Process` class — state machine (`created → starting → running → paused → terminated | crashed`)
- `MemoryBus` — namespaced in-memory key-value store with shared memory namespace
- `ProcessState` enum and all core types in `src/core/types.ts`
- `KernelEvent` structured event system with `on()` / `onAny()` / unsubscribe support
- `Kernel.spawn()` — create a running process from a registered agent definition
- `Kernel.pause()`, `resume()`, `terminate()` — full process lifecycle management
- `Kernel.maxProcesses` config — cap concurrent active processes
- Unit tests for `Agent`, `Process`, `Kernel`, `MemoryBus`
- GitHub Actions CI/CD (test on push/PR, publish on tag)
- RFC-001 (Process State Machine Design) — accepted
- Architecture Overview documentation
- Getting Started guide
- 3 example projects: `hello-world.ts`, `multi-agent.ts`, `memory-demo.ts`
- MIT License, Code of Conduct, Contributing guide

[Unreleased]: https://github.com/llmhut/agentvm/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/llmhut/agentvm/compare/v0.2.3...v0.3.0
[0.2.2]: https://github.com/llmhut/agentvm/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/llmhut/agentvm/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/llmhut/agentvm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/llmhut/agentvm/releases/tag/v0.1.0

