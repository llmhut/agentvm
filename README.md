<div align="center">

# 🔩 AgentVM

### The Runtime Your AI Agents Deserve

**Process management · Memory bus · Tool routing · Message passing · Scheduling**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![npm version](https://img.shields.io/badge/npm-v0.1.0--alpha-orange)]()
[![Discord](https://img.shields.io/badge/Discord-Join%20us-7289DA)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

[Documentation](./docs) · [Quick Start](#quick-start) · [Roadmap](#roadmap) · [Contributing](CONTRIBUTING.md) · [Discord]()

</div>

---

## The Problem

Every AI agent framework reinvents the same infrastructure: process lifecycle, memory, tool routing, scheduling, inter-agent messaging. The result? Shallow implementations, incompatible ecosystems, and wasted effort.

**AgentVM fixes this.** It's the shared runtime layer that sits *beneath* agent frameworks — handling the OS-level concerns so framework developers can focus on what matters: reasoning, planning, and workflow design.

> Think of it this way: LangChain, CrewAI, and AutoGen are applications. AgentVM is their operating system.

---

## Why AgentVM?

| Without AgentVM | With AgentVM |
|---|---|
| Every framework builds its own process model | Shared, battle-tested process lifecycle |
| Memory is an afterthought (chat buffers) | First-class memory bus with pluggable backends |
| Tools are framework-specific | Universal tool registry with permissions |
| No inter-agent communication standard | Built-in message broker (pub/sub + direct) |
| Debugging is guesswork | Structured events for full observability |
| Agents crash with no recovery | Checkpointing and automatic crash recovery |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Agent Framework                       │
│              (LangChain, CrewAI, AutoGen, yours)             │
├─────────────────────────────────────────────────────────────┤
│                      AgentVM API                         │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Process  │  Memory  │   Tool   │ Message  │    Scheduler    │
│ Manager  │   Bus    │  Router  │  Broker  │                 │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│                    Storage Layer                              │
│            (SQLite · Redis · PostgreSQL · S3)                 │
└─────────────────────────────────────────────────────────────┘
```

### Core Modules

**🔄 Process Manager** — Spawn, pause, resume, and terminate agent processes. Each agent runs as an isolated unit with its own lifecycle, resource limits, and crash recovery.

**🧠 Memory Bus** — Shared memory subsystem with working (short-term), persistent (long-term), and shared (cross-agent) tiers. Pluggable storage backends.

**🔧 Tool Router** — Central registry for tools with automatic discovery, permission enforcement, rate limiting, and sandboxed execution.

**📨 Message Broker** — Pub/sub and direct channels for inter-agent communication. Typed messages, priority queues, and dead-letter handling.

**📅 Scheduler** — Parallel, sequential, conditional, and event-driven task execution with dependency resolution.

---

## Quick Start

### Installation

```bash
npm install @llmhut/agentvm
```

### Hello World — Your First Agent

```typescript
import { Kernel, Agent, Tool } from '@llmhut/agentvm';

// Initialize the kernel
const kernel = new Kernel();

// Define an agent
const researcher = new Agent({
  name: 'researcher',
  description: 'Searches the web and summarizes findings',
  tools: ['web_search', 'summarize'],
  memory: { persistent: true },
});

// Register and spawn
kernel.register(researcher);
const process = await kernel.spawn('researcher');

// Send a task
const result = await process.execute({
  task: 'Find the latest developments in agentic AI',
});

console.log(result);

// Clean up
await kernel.terminate(process.id);
```

### Multi-Agent Workflow

```typescript
import { Kernel, Agent, Pipeline } from '@llmhut/agentvm';

const kernel = new Kernel();

// Define agents with typed contracts
const researcher = new Agent({
  name: 'researcher',
  input: { type: 'string', description: 'Topic to research' },
  output: { type: 'string', description: 'Raw research findings' },
});

const writer = new Agent({
  name: 'writer',
  input: { type: 'string', description: 'Research to turn into article' },
  output: { type: 'string', description: 'Polished article' },
});

const reviewer = new Agent({
  name: 'reviewer',
  input: { type: 'string', description: 'Article to review' },
  output: { type: 'object', description: 'Review with score and feedback' },
});

// Compose into a pipeline
const pipeline = new Pipeline([researcher, writer, reviewer]);

kernel.register(researcher, writer, reviewer);
const result = await kernel.run(pipeline, {
  input: 'The future of AI agents in enterprise',
});

console.log(result);
```

### Inter-Agent Messaging

```typescript
import { Kernel, Agent, Channel } from '@llmhut/agentvm';

const kernel = new Kernel();

// Create a shared channel
const channel = new Channel('research-updates', {
  type: 'pubsub',
  schema: { topic: 'string', findings: 'string[]' },
});

kernel.createChannel(channel);

// Agents subscribe and publish
const agent1 = await kernel.spawn('researcher-1');
const agent2 = await kernel.spawn('researcher-2');
const coordinator = await kernel.spawn('coordinator');

// Coordinator listens for updates
coordinator.subscribe('research-updates', (message) => {
  console.log(`${message.from}: found ${message.data.findings.length} results`);
});

// Researchers publish findings
agent1.publish('research-updates', {
  topic: 'LLM benchmarks',
  findings: ['GPT-4o leads on reasoning', 'Claude excels at code'],
});
```

---

## Roadmap

We're building in public. Here's where we're headed:

### ✅ Phase 1 — Foundation (v0.1.x) `COMPLETE`
- [x] Project scaffolding and repo setup
- [x] Agent process model (spawn / pause / resume / kill)
- [x] In-memory state management
- [x] Basic CLI (`agentvm start`, `agentvm ps`, `agentvm kill`)
- [x] TypeScript SDK with full type safety
- [x] Core event system
- [x] 135 unit tests at 90%+ coverage

### 🟢 Phase 2 — Core Engine (v0.2.x) `← WE ARE HERE`
- [x] Tool router with permission model
- [x] Message broker (pub/sub + direct channels)
- [x] Event-driven scheduler with dependency resolution
- [ ] Pluggable memory backends (SQLite, Redis)
- [ ] Agent contracts with runtime validation
- [ ] Configuration system (YAML + env vars)

### 🟡 Phase 3 — Ecosystem (v0.3.x)
- [ ] LangChain adapter plugin
- [ ] CrewAI adapter plugin
- [ ] Resource monitoring and limits (tokens, time, cost)
- [ ] Crash recovery and checkpointing
- [ ] Docker-based tool sandboxing
- [ ] Python SDK

### 🟠 Phase 4 — Production (v1.0)
- [ ] Distributed mode (multi-node agent clusters)
- [ ] Kubernetes operator
- [ ] Admin dashboard web UI
- [ ] Performance benchmarks and optimization
- [ ] Comprehensive documentation and tutorials
- [ ] Security audit

> 📋 See [ROADMAP.md](./ROADMAP.md) for the full breakdown with milestones and RFCs.

## Project Structure

```
agentvm/
├── src/
│   ├── core/              # Kernel, Agent, Process primitives
│   │   ├── kernel.ts      # Main kernel runtime
│   │   ├── agent.ts       # Agent definition and lifecycle
│   │   ├── process.ts     # Process management
│   │   └── types.ts       # Shared type definitions
│   ├── memory/            # Memory bus and backends
│   │   ├── bus.ts         # Memory bus interface
│   │   ├── working.ts     # Short-term working memory
│   │   ├── persistent.ts  # Long-term persistent memory
│   │   └── backends/      # SQLite, Redis, etc.
│   ├── tools/             # Tool router and registry
│   │   ├── router.ts      # Tool routing engine
│   │   ├── registry.ts    # Tool registration
│   │   ├── permissions.ts # Permission enforcement
│   │   └── sandbox.ts     # Sandboxed execution
│   ├── broker/            # Message broker
│   │   ├── broker.ts      # Core broker
│   │   ├── channel.ts     # Channel management
│   │   └── pubsub.ts      # Pub/sub implementation
│   ├── scheduler/         # Task scheduler
│   │   ├── scheduler.ts   # Scheduling engine
│   │   ├── queue.ts       # Priority queue
│   │   └── strategies.ts  # Parallel, sequential, conditional
│   └── cli/               # CLI interface
│       └── index.ts       # CLI commands
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/
│   ├── architecture/      # Architecture decision records
│   ├── guides/            # Developer guides
│   └── rfcs/              # Request for comments
├── examples/              # Example projects
├── benchmarks/            # Performance benchmarks
└── package.json
```

---

## Philosophy

**1. Framework-agnostic.** AgentVM doesn't care what sits on top. LangChain, CrewAI, your custom thing — they all get the same runtime.

**2. Batteries included, not required.** Every module works standalone. Use just the scheduler. Use just the memory bus. Mix and match.

**3. Observable by default.** Every operation emits structured events. Plug in any observability tool and see exactly what your agents are doing.

**4. Production-first.** This isn't a toy. Crash recovery, resource limits, sandboxing, and distributed mode from day one.

**5. Build in public.** Every design decision is documented. Every RFC is public. Every milestone is tracked. Join us.

---

## Contributing

We welcome contributions of all kinds! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

**Good first issues** are tagged with `good-first-issue` — perfect for getting started.

**Ways to contribute:**
- 🐛 Report bugs and request features
- 📝 Improve documentation
- 🧪 Write tests
- 🔧 Submit PRs for open issues
- 💬 Help others in Discord
- 📐 Propose RFCs for new features

---

## Community

- **Discord** — Real-time discussion, help, and collaboration
- **GitHub Discussions** — Long-form conversations and proposals
- **Twitter/X** — Updates and announcements
- **Blog** — Deep dives into architecture decisions

---

## License

MIT — use it however you want. See [LICENSE](LICENSE) for details.

---

<div align="center">

**AgentVM is built by the community, for the community.**

If this project resonates with you, give it a ⭐ and join us in building the foundation of agentic AI.

[⭐ Star on GitHub]() · [💬 Join Discord]() · [🐦 Follow on X]()

</div>
