# What is AgentVM?

AgentVM is a **runtime for AI agents**. It handles the infrastructure that every agent system needs — process lifecycle, memory, tools, messaging, and scheduling — so you can focus on what your agents actually do.

Think of it as an operating system for AI agents. Your code defines the agents. AgentVM manages everything else.

## The Problem

Every AI agent project ends up rebuilding the same infrastructure:

- **Process management** — How do you spawn, pause, and terminate agents?
- **Memory** — How do agents persist state across calls? Across restarts?
- **Tools** — How do you register, permission, and rate-limit tool access?
- **Coordination** — How do multiple agents communicate and share work?
- **Observability** — What's running? How many tokens did it use? Did anything crash?

These concerns are the same whether you're building with LangChain, the Vercel AI SDK, raw OpenAI calls, or your own framework. But everyone solves them differently, creating lock-in and duplicated effort.

## The Solution

AgentVM provides a single, framework-agnostic runtime layer:

```
┌──────────────────────────────────────┐
│  Your Code / Framework (LangChain,   │
│  AI SDK, custom, etc.)               │
├──────────────────────────────────────┤
│           AgentVM Runtime            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
│  │Kernel│ │Memory│ │Tools │ │Sched│ │
│  │      │ │ Bus  │ │Router│ │uler │ │
│  └──────┘ └──────┘ └──────┘ └─────┘ │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
│  │Broker│ │ MCP  │ │Check-│ │Adapt│ │
│  │      │ │Client│ │point │ │ers  │ │
│  └──────┘ └──────┘ └──────┘ └─────┘ │
├──────────────────────────────────────┤
│  Storage (InMemory / SQLite / ...)   │
└──────────────────────────────────────┘
```

## Key Design Decisions

**Framework-agnostic.** AgentVM has no opinion about which LLM you use, how you prompt it, or what agent framework sits on top. It works with LangChain, Vercel AI SDK, OpenAI directly, Anthropic directly, or no framework at all.

**Zero lock-in.** Adapters produce plain objects matching each framework's interface. No subclassing required. Switch frameworks without changing your tool definitions.

**Pluggable everything.** Memory backends, tool handlers, message transports — swap any component without touching the rest.

**TypeScript-first.** Full type safety with strict mode. Runtime validation at boundaries via agent contracts.

## When to Use AgentVM

✅ You're building multi-agent systems that need coordination
✅ You want persistent memory that survives restarts
✅ You need tool access control (permissions, rate limiting)
✅ You want to use MCP tools from Claude Desktop, Cursor, etc.
✅ You want one tool registry that works across LangChain, AI SDK, and raw API calls

❌ You just want to make a single LLM call (use the SDK directly)
❌ You need distributed computing across multiple machines (coming in v1.0)

## Next Steps

→ [Getting Started](/guide/getting-started) — Install and run your first agent in 5 minutes
