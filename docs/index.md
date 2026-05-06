---
layout: home

hero:
  name: AgentVM
  text: The runtime your AI agents deserve
  tagline: Process management, memory, tools, messaging, and scheduling for autonomous AI agents. Framework-agnostic. Zero lock-in.
  image:
    src: /logo.png
    alt: AgentVM
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/llmhut/agentvm

features:
  - icon: 🔄
    title: Process Manager
    details: Spawn, pause, resume, and terminate agent processes. Each agent runs with its own lifecycle, memory, and crash recovery.
  - icon: 🧠
    title: Pluggable Memory
    details: In-memory or SQLite persistence out of the box. Agents remember across restarts. Plug in your own backend.
  - icon: 🔧
    title: Tool Router
    details: Register tools with rate limiting, permissions, and side-effect tracking. Agents only access what you allow.
  - icon: 🤖
    title: LLM Agents
    details: "createLLMAgent() wires up Anthropic or OpenAI with an automatic tool-use loop. Multi-agent pipelines in 10 lines."
  - icon: 🔌
    title: MCP Integration
    details: Connect to any MCP server (stdio or SSE). Tools auto-register with the kernel. Claude Desktop, Cursor, and more.
  - icon: 🔗
    title: Framework Adapters
    details: Use AgentVM tools in LangChain, Vercel AI SDK, OpenAI, or Anthropic. Zero-dependency adapters that produce plain objects.
---
