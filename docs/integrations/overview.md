# Integrations

AgentVM works with any AI framework. Adapters produce plain objects matching each framework's tool interface — **zero framework dependencies**.

## Supported Frameworks

| Framework | Adapter | What You Get |
|-----------|---------|-------------|
| [LangChain.js](/integrations/langchain) | `toLangChainTools()` + `toLangChainMemory()` | Tools + persistent memory |
| [Vercel AI SDK](/integrations/vercel-ai-sdk) | `toAISDKTools()` + `createUsageTracker()` | Tools + token tracking |
| [OpenAI](/integrations/openai-anthropic) | `toOpenAITools()` | Function calling format |
| [Anthropic](/integrations/openai-anthropic) | `toAnthropicTools()` | Tool use format |
| [MCP](/integrations/mcp-server) | `serveMCP()` | Expose tools to Claude Desktop, Cursor |
| Any framework | `createToolExecutor()` | Generic tool executor |

## Architecture

```
Your App
  ↓
Framework (LangChain / AI SDK / raw API)
  ↓
AgentVM Adapters (plain objects, zero deps)
  ↓
AgentVM Kernel (tools, memory, permissions, rate limiting)
  ↓
Storage Backend (InMemory / SQLite)
```

All adapters are in `@llmhut/agentvm` — no extra packages needed.

For a first-class LangChain integration with `BaseToolkit` and `BaseMemory` subclasses, see the separate [`@llmhut/langchain-agentvm`](https://github.com/llmhut/agentvm/tree/main/packages/langchain-agentvm) package.
