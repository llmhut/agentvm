# AgentVM Roadmap

> **Building in public.** Every milestone, every decision, every trade-off — documented here.
>
> Last updated: April 2026

---

## Release Timeline

| Version | Codename | Target | Status |
|---------|----------|--------|--------|
| v0.1.0 | **Genesis** | Q2 2026 | ✅ Released |
| v0.2.x | **Ignition** | Q2 2026 | ✅ Released (v0.2.2) |
| v0.3.0 | **Bridge** | Q3 2026 | 🟢 In Progress |
| v1.0.0 | **Launch** | Q1 2027 | ⬜ Planned |

---

## Phase 1 — Genesis (v0.1.0) ✅

**Goal:** A working kernel that can spawn, manage, and terminate agent processes with in-memory state.

**Motto:** *"Make it work."*

### Shipped

- [x] `Kernel` class — agent registry, process lifecycle, event system
- [x] `Agent` definition — name, description, config, capability declarations
- [x] `Process` model — spawn, pause, resume, terminate with state transitions
- [x] Process states: `created → starting → running → paused → terminated → crashed`
- [x] Event emitter — all lifecycle events fire structured `KernelEvent` objects
- [x] In-memory process store
- [x] `MemoryBus` — namespaced key-value store, shared namespace, TTL support
- [x] CLI scaffold: `agentvm init`, `start`, `spawn`, `ps`, `kill`, `logs`
- [x] TypeScript SDK with full type inference
- [x] Unit tests for all core modules
- [x] RFC-001 (Process State Machine Design) — accepted
- [x] Architecture Overview, Getting Started guide, Contributing guide
- [x] GitHub Actions CI/CD

---

## Phase 2 — Ignition (v0.2.x) ✅

**Goal:** Tool routing, message passing, scheduling, and LLM integration turn AgentVM into a real multi-agent runtime.

**Motto:** *"Make it useful."*

### Shipped in v0.2.0

- [x] `ToolRouter` — registry, invocation, rate limiting, permission checks
- [x] `MessageBroker` — pub/sub channels, direct messaging, priority, history, dead-letter handling
- [x] `Scheduler` — sequential, parallel, race, conditional strategies with dependency resolution and retry
- [x] `Kernel.execute()` — `ExecutionContext` with memory, tools, publish, emit, AbortSignal
- [x] Agent tool allowlist enforcement
- [x] RFC-002 (Memory Bus Interface Contract) — accepted
- [x] RFC-003 (Event Schema Specification) — accepted

### Shipped in v0.2.1

- [x] `AgentContract` types — typed input/output, SLA fields (`maxLatency`, `maxCost`)
- [x] `Kernel.registerTool()` and `Kernel.createChannel()` convenience methods
- [x] `MemoryBus.stats`, `MessageBroker.stats`, `Scheduler.stats`
- [x] Idempotent `Process._terminate()`
- [x] Scoped rate limit counters (per agent, not global)

### Shipped in v0.2.2

- [x] `MCPClient` — stdio + SSE transports, JSON-RPC 2.0, auto-registers MCP tools
- [x] `createLLMAgent()` — Anthropic + OpenAI, agentic tool loop, conversation history, token tracking
- [x] `createPipeline()` — sequential multi-agent pipeline helper
- [x] Built-in tools: `http_fetch`, `json_fetch`, `shell_exec`, `file_read`, `file_write`, `wait`
- [x] `registerBuiltins(kernel)` convenience function
- [x] Example projects: `llm-pipeline.ts`, `mcp-agent.ts`, `llm-research-agent.ts`
- [x] Tests for LLM agent and MCP client

---

## Phase 3 — Bridge (v0.3.0)

**Goal:** Persistent state, runtime contract enforcement, config system, and framework adapters.

**Motto:** *"Make it connect."*

### Milestones

#### M3.1 — Config System
- [ ] YAML config file (`agentvm.yml`) — declare agents, tools, channels declaratively
- [ ] Environment variable overrides for all config fields
- [ ] Config validation on startup with helpful error messages
- [ ] Hot-reload for non-breaking config changes
- [ ] `agentvm validate` CLI command

#### M3.2 — Persistent Memory Backends
- [ ] `MemoryBackend` interface — stable contract all backends implement
- [ ] SQLite backend — embedded, zero-config, file-based persistence
- [ ] Redis backend — distributed cache + pub/sub, connection pooling
- [ ] Backend selection via `memory: { backend: 'sqlite' }` in `AgentConfig`
- [ ] Migration utility — move memory data between backends

#### M3.3 — Agent Contract Enforcement
- [ ] Runtime input validation against `AgentContract.input` schema
- [ ] Runtime output validation against `AgentContract.output` schema
- [ ] `Pipeline` validates type compatibility between chained agents at construction time
- [ ] SLA enforcement — timeout processes that exceed `maxLatency`, warn on `maxCost`
- [ ] RFC-004 (Agent Contract Enforcement) — in progress

#### M3.4 — Resource Tracking
- [ ] Surface `tokensUsed` and `cost` on `ExecutionResult` (currently always `undefined`)
- [ ] LLM agent propagates `__llm_usage` to `ExecutionResult` automatically
- [ ] Per-process token budget — abort execution when limit exceeded
- [ ] `Kernel.stats()` — aggregate resource usage across all processes

#### M3.5 — Checkpointing
- [ ] `Process.checkpoint()` — serialize process state to disk
- [ ] `Kernel.restore(checkpointPath)` — restart process from checkpoint
- [ ] Automatic checkpoint on crash
- [ ] RFC-005 (Checkpointing Strategy) — planned

#### M3.6 — Framework Adapters
- [ ] LangChain adapter — use `AgentVM` as LangChain's memory and tool runtime
- [ ] CrewAI adapter — map CrewAI agents to AgentVM processes
- [ ] Adapter test suites and migration guides

### Phase 3 RFCs
- `RFC-004` — Agent Contract Enforcement
- `RFC-005` — Checkpointing Strategy
- `RFC-006` — Persistent Memory Backend Interface

---

## Phase 4 — Launch (v1.0.0)

**Goal:** Production-grade, distributed, and battle-tested.

**Motto:** *"Make it scale."*

### Milestones

#### M4.1 — Distributed Mode
- [ ] Multi-node kernel clusters
- [ ] Process migration between nodes
- [ ] Distributed message broker (NATS integration)
- [ ] Shared state across nodes (CRDTs or distributed locks)
- [ ] Node discovery and health monitoring

#### M4.2 — Kubernetes Operator
- [ ] Custom Resource Definitions (CRDs) for agents and workflows
- [ ] Auto-scaling based on task queue depth
- [ ] Rolling updates for agent definitions
- [ ] Helm chart for easy deployment

#### M4.3 — Admin Dashboard
- [ ] Web UI for monitoring all running processes
- [ ] Real-time event stream visualization
- [ ] Resource consumption graphs
- [ ] Tool usage analytics
- [ ] Channel activity monitor
- [ ] Process management (spawn/kill from UI)

#### M4.4 — Hardening
- [ ] Performance benchmarks (latency, throughput, memory)
- [ ] Load testing at 1000+ concurrent agents
- [ ] Security audit (tool permissions, sandbox escapes, injection)
- [ ] API stability guarantee — semantic versioning commitment
- [ ] Comprehensive documentation site
- [ ] Python SDK

### Phase 4 RFCs
- `RFC-007` — Distributed Consensus Model
- `RFC-008` — Kubernetes CRD Specification
- `RFC-009` — Dashboard Architecture
- `RFC-010` — v1.0 API Stability Contract

---

## Feature Requests & Voting

We use GitHub Discussions for feature requests. The community votes on what gets built next.

**How to propose a feature:**
1. Open a Discussion in the "Feature Requests" category
2. Describe the problem, proposed solution, and alternatives
3. Community votes with 👍
4. Top-voted features get added to the next phase

**How to propose an architectural change:**
1. Write an RFC in `docs/rfcs/` using the template in `RFC-000-TEMPLATE.md`
2. Open a PR
3. Community reviews and discusses
4. Maintainers approve or request changes
5. Approved RFCs get scheduled into a phase

---

## Build in Public Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-26 | Project kickoff | Repository created, roadmap published |
| 2026-03-31 | v0.2.0 released | ToolRouter, MessageBroker, Scheduler, Kernel.execute() |
| 2026-04-05 | v0.2.1 released | AgentContract types, convenience methods, bug fixes |
| 2026-04-11 | v0.2.2 released | MCPClient, createLLMAgent, built-in tools, pipeline helper |

> This log is updated with every major decision. Subscribe to releases to get notified.

---

## How to Get Involved

- **Build:** Pick an open issue and submit a PR
- **Design:** Write or review RFCs
- **Test:** Try the latest release and report bugs
- **Spread:** Star the repo, share on socials, write blog posts
- **Discuss:** Join GitHub Discussions or Discord

Every contribution matters. Let's build this together.
