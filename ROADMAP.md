# 🗺️ AgentVM Roadmap

> **Building in public.** Every milestone, every decision, every trade-off — documented here.
>
> Last updated: March 2026

---

## Release Timeline

| Version | Codename | Target | Status |
|---------|----------|--------|--------|
| v0.1.0 | **Genesis** | Q2 2026 |  ✅ Completed |
| v0.2.0 | **Ignition** | Q3 2026 | 🟢 In Progress |
| v0.3.0 | **Bridge** | Q4 2026 | ⬜ Planned |
| v1.0.0 | **Launch** | Q1 2027 | ⬜ Planned |

---

## Phase 1 — Genesis (v0.1.0)

**Goal:** A working kernel that can spawn, manage, and terminate agent processes with in-memory state.

**Motto:** *"Make it work."*

### Milestones

#### M1.1 — Core Primitives (Weeks 1–3)
- [ ] `Kernel` class — singleton runtime, agent registry, lifecycle hooks
- [ ] `Agent` definition — name, description, config, capability declarations
- [ ] `Process` model — spawn, pause, resume, terminate with state transitions
- [ ] Process states: `created → starting → running → paused → terminated → crashed`
- [ ] Event emitter — all lifecycle events fire structured events
- [ ] In-memory process store

**Deliverable:** You can `kernel.spawn()` an agent and manage its lifecycle programmatically.

#### M1.2 — Working Memory (Weeks 3–4)
- [ ] `MemoryBus` interface — read, write, query, delete
- [ ] `WorkingMemory` — per-process short-term store (Map-based)
- [ ] `SharedMemory` — cross-process shared state with locking
- [ ] Memory namespacing — processes can't access each other's working memory
- [ ] Memory events — every read/write emits an event

**Deliverable:** Agents have isolated working memory and can share state through SharedMemory.

#### M1.3 — CLI (Weeks 4–5)
- [ ] `agentvm init` — scaffold a new project
- [ ] `agentvm start` — start the kernel
- [ ] `agentvm spawn <agent>` — spawn an agent process
- [ ] `agentvm ps` — list running processes
- [ ] `agentvm kill <pid>` — terminate a process
- [ ] `agentvm logs <pid>` — stream process events
- [ ] Pretty terminal output with colors and tables

**Deliverable:** Full CLI for managing agents from the terminal.

#### M1.4 — Developer Experience (Weeks 5–6)
- [ ] TypeScript SDK with full type inference
- [ ] Comprehensive JSDoc comments
- [ ] 80%+ test coverage for core module
- [ ] Getting Started guide
- [ ] 3 example projects (hello-world, multi-agent, memory-demo)
- [ ] API reference docs (auto-generated)

**Deliverable:** A developer can go from `npm install` to running agents in under 5 minutes.

### Phase 1 RFCs
- `RFC-001` — Process State Machine Design
- `RFC-002` — Memory Bus Interface Contract
- `RFC-003` — Event Schema Specification

---

## Phase 2 — Ignition (v0.2.0)

**Goal:** Tool routing, message passing, and scheduling turn AgentVM into a real multi-agent runtime.

**Motto:** *"Make it useful."*

### Milestones

#### M2.1 — Tool Router (Weeks 1–3)
- [ ] `ToolRegistry` — register, discover, and invoke tools
- [ ] Tool definition schema — name, description, parameters (JSON Schema), side effects
- [ ] Permission model — `read`, `write`, `execute`, `admin` per tool per agent
- [ ] Rate limiting — per-tool, per-agent configurable limits
- [ ] Tool execution middleware — logging, timing, error handling
- [ ] Built-in tools: `noop`, `echo`, `sleep` (for testing)

#### M2.2 — Message Broker (Weeks 3–5)
- [ ] `Channel` primitive — named, typed communication pipe
- [ ] Pub/sub pattern — agents subscribe to topics, publish messages
- [ ] Direct messaging — point-to-point between specific processes
- [ ] Message schema validation — typed payloads with runtime checking
- [ ] Priority queues — urgent messages jump the line
- [ ] Dead-letter queue — undeliverable messages captured for debugging
- [ ] Message history — queryable log of all channel activity

#### M2.3 — Scheduler (Weeks 5–7)
- [ ] `TaskQueue` — priority-based task scheduling
- [ ] Execution strategies: `sequential`, `parallel`, `conditional`, `race`
- [ ] Dependency resolution — task B waits for task A
- [ ] Cron-like recurring tasks
- [ ] Timeout and retry policies
- [ ] Backpressure — throttle when system is overloaded

#### M2.4 — Agent Contracts (Weeks 7–8)
- [ ] Typed input/output contracts per agent
- [ ] Runtime validation — reject invalid inputs before execution
- [ ] Contract composition — Pipeline validates that agent outputs match next agent's inputs
- [ ] SLA declarations — expected latency, cost ceiling, reliability
- [ ] Contract registry — queryable catalog of agent capabilities

#### M2.5 — Configuration (Week 8)
- [ ] YAML config file support (`agentvm.yml`)
- [ ] Environment variable overrides
- [ ] Config validation on startup
- [ ] Hot-reload for non-breaking config changes

### Phase 2 RFCs
- `RFC-004` — Tool Permission Model
- `RFC-005` — Message Broker Protocol
- `RFC-006` — Scheduler Execution Strategies
- `RFC-007` — Agent Contract Specification

---

## Phase 3 — Bridge (v0.3.0)

**Goal:** Connect AgentVM to the broader ecosystem and make it production-aware.

**Motto:** *"Make it connect."*

### Milestones

#### M3.1 — Framework Adapters (Weeks 1–3)
- [ ] LangChain adapter — use AgentVM as LangChain's runtime
- [ ] CrewAI adapter — CrewAI agents run on AgentVM processes
- [ ] AutoGen adapter — AutoGen conversations map to AgentVM channels
- [ ] Adapter documentation and migration guides
- [ ] Adapter test suites

#### M3.2 — Persistent Memory Backends (Weeks 3–5)
- [ ] SQLite backend — embedded, zero-config persistent memory
- [ ] Redis backend — distributed, high-performance cache + persistence
- [ ] PostgreSQL backend — full relational persistence
- [ ] Backend interface — easy to implement custom backends
- [ ] Memory migration tools — move data between backends

#### M3.3 — Resource Management (Weeks 5–7)
- [ ] Token budget tracking — per-process, per-agent limits
- [ ] Cost estimation — track API costs in real time
- [ ] Time limits — automatic termination after timeout
- [ ] Memory limits — cap per-process memory usage
- [ ] Resource dashboard — see what each agent is consuming
- [ ] Budget alerts — notifications when approaching limits

#### M3.4 — Reliability (Weeks 7–9)
- [ ] Process checkpointing — save state to disk periodically
- [ ] Crash recovery — restart from last checkpoint
- [ ] Graceful degradation — partial failures don't crash the kernel
- [ ] Health checks — per-process and system-wide
- [ ] Circuit breaker — disable failing tools automatically

#### M3.5 — Python SDK (Weeks 9–10)
- [ ] Python client library (asyncio-based)
- [ ] Feature parity with TypeScript SDK
- [ ] Python-specific examples and docs
- [ ] PyPI package

#### M3.6 — Tool Sandboxing (Weeks 10–12)
- [ ] Docker-based tool execution
- [ ] Network isolation — tools can't access unauthorized endpoints
- [ ] Filesystem isolation — tools can't access host filesystem
- [ ] Resource limits — CPU, memory, time per tool execution
- [ ] Sandbox pooling — reuse warm containers for performance

### Phase 3 RFCs
- `RFC-008` — Memory Backend Interface
- `RFC-009` — Resource Budgeting Model
- `RFC-010` — Checkpointing Strategy
- `RFC-011` — Tool Sandbox Security Model

---

## Phase 4 — Launch (v1.0.0)

**Goal:** Production-grade, distributed, and battle-tested.

**Motto:** *"Make it scale."*

### Milestones

#### M4.1 — Distributed Mode (Weeks 1–4)
- [ ] Multi-node kernel clusters
- [ ] Process migration — move agents between nodes
- [ ] Distributed message broker (NATS integration)
- [ ] Shared state across nodes (CRDTs or distributed locks)
- [ ] Node discovery and health monitoring

#### M4.2 — Kubernetes Operator (Weeks 4–6)
- [ ] Custom Resource Definitions (CRDs) for agents and workflows
- [ ] Auto-scaling based on task queue depth
- [ ] Rolling updates for agent definitions
- [ ] Helm chart for easy deployment

#### M4.3 — Admin Dashboard (Weeks 6–9)
- [ ] Web UI for monitoring all running processes
- [ ] Real-time event stream visualization
- [ ] Resource consumption graphs
- [ ] Tool usage analytics
- [ ] Channel activity monitor
- [ ] Process management (spawn/kill from UI)

#### M4.4 — Hardening (Weeks 9–12)
- [ ] Performance benchmarks (latency, throughput, memory)
- [ ] Load testing at 1000+ concurrent agents
- [ ] Security audit (tool permissions, sandbox escapes, injection)
- [ ] API stability guarantee — semantic versioning commitment
- [ ] Comprehensive documentation site
- [ ] Migration guide from v0.x to v1.0

### Phase 4 RFCs
- `RFC-012` — Distributed Consensus Model
- `RFC-013` — Kubernetes CRD Specification
- `RFC-014` — Dashboard Architecture
- `RFC-015` — v1.0 API Stability Contract

---

## Feature Requests & Voting

We use GitHub Discussions for feature requests. The community votes on what gets built next.

**How to propose a feature:**
1. Open a Discussion in the "Feature Requests" category
2. Describe the problem, proposed solution, and alternatives considered
3. Community votes with 👍
4. Top-voted features get added to the next phase

**How to propose an architectural change:**
1. Write an RFC in `docs/rfcs/`
2. Open a PR
3. Community reviews and discusses
4. Maintainers approve or request changes
5. Approved RFCs get scheduled into a phase

---

## Build in Public Log

We document every significant decision. Follow along:

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-26 | Project kickoff | Repository created, roadmap published |
| | | |

> This log is updated with every major decision. Subscribe to releases to get notified.

---

## How to Get Involved

- **🔨 Build:** Pick an open issue and submit a PR
- **📐 Design:** Write or review RFCs
- **🧪 Test:** Try the latest release and report bugs
- **📣 Spread:** Star the repo, share on socials, write blog posts
- **💬 Discuss:** Join GitHub Discussions or Discord

Every contribution matters. Let's build this together.
