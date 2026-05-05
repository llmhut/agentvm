# AgentVM Sample App — Research & Write

A complete, end-to-end application built on AgentVM that demonstrates how all the pieces fit together in a real project.

## What It Does

This app is a **CLI research assistant** with three agents that collaborate:

1. **Researcher** — Takes a topic, fetches web pages, extracts key information
2. **Writer** — Takes research notes and produces a polished article
3. **Fact-Checker** — Reviews the article, flags unsupported claims

The agents use:
- **Tools** (`http_fetch`, `extract_text`) to gather real data
- **Memory** (SQLite-backed) to persist conversation history across runs
- **Contracts** to validate input/output types at runtime
- **Channels** to publish status updates as they work
- **Checkpointing** to save progress and resume later

## How to Run

```bash
# From the agentvm root directory
cd examples/sample-app

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run it
npx tsx app.ts "The rise of AI agents in 2026"

# Or run without an API key (uses mock LLM responses)
npx tsx app.ts --mock "The rise of AI agents in 2026"
```

## Project Structure

```
sample-app/
├── app.ts              # Entry point — wires everything together
├── agents.ts           # Agent definitions (researcher, writer, fact-checker)
├── tools.ts            # Custom tools (extract_text)
├── config.ts           # Kernel setup, memory backend, channels
└── README.md           # This file
```

## What This Demonstrates

| AgentVM Feature | Where It's Used |
|---|---|
| `Kernel` + `Agent` + `Process` | Core orchestration in `app.ts` |
| `MemoryBus` + `SqliteBackend` | Persistent memory in `config.ts` |
| `ToolRouter` + built-in tools | `http_fetch` in researcher agent |
| Custom tools | `extract_text` in `tools.ts` |
| `AgentContract` | Input/output validation on all agents |
| `MessageBroker` | Status channel in `config.ts` |
| `checkpoint` / `restore` | Save/resume in `app.ts` |
| `createLLMAgent` | LLM-powered agents in `agents.ts` |
| `Kernel.stats()` | Final stats printout in `app.ts` |
