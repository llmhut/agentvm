import{_ as a,o as n,c as e,ag as p}from"./chunks/framework.C9sp7nFj.js";const u=JSON.parse('{"title":"Architecture Overview","description":"","frontmatter":{},"headers":[],"relativePath":"architecture/OVERVIEW.md","filePath":"architecture/OVERVIEW.md"}'),i={name:"architecture/OVERVIEW.md"};function t(l,s,o,r,c,d){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="architecture-overview" tabindex="-1">Architecture Overview <a class="header-anchor" href="#architecture-overview" aria-label="Permalink to &quot;Architecture Overview&quot;">​</a></h1><h2 id="design-principles" tabindex="-1">Design Principles <a class="header-anchor" href="#design-principles" aria-label="Permalink to &quot;Design Principles&quot;">​</a></h2><ol><li><strong>Modular</strong> — Every component (memory, tools, broker, scheduler) is independent and replaceable.</li><li><strong>Event-driven</strong> — All operations emit structured events. Observability is built in, not bolted on.</li><li><strong>Framework-agnostic</strong> — No opinions about LLMs, prompting strategies, or agent reasoning.</li><li><strong>Async-first</strong> — All I/O operations are non-blocking. The scheduler handles concurrency.</li><li><strong>Type-safe</strong> — Full TypeScript with strict mode. Runtime validation at boundaries.</li></ol><h2 id="component-diagram" tabindex="-1">Component Diagram <a class="header-anchor" href="#component-diagram" aria-label="Permalink to &quot;Component Diagram&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                      ┌──────────────────────────────────┐</span></span>
<span class="line"><span>                      │    Your Code / Agent Framework    │</span></span>
<span class="line"><span>                      └─────────────────┬────────────────┘</span></span>
<span class="line"><span>                                        │</span></span>
<span class="line"><span>              ┌─────────────────────────▼────────────────────────┐</span></span>
<span class="line"><span>              │                      Kernel                       │</span></span>
<span class="line"><span>              │              (Central Orchestrator)               │</span></span>
<span class="line"><span>              └──┬──────┬──────┬──────┬──────┬──────┬───────────┘</span></span>
<span class="line"><span>                 │      │      │      │      │      │</span></span>
<span class="line"><span>         ┌───────┘  ┌───┘  ┌───┘  ┌───┘  ┌───┘  ┌───┘</span></span>
<span class="line"><span>         ▼          ▼      ▼      ▼      ▼      ▼</span></span>
<span class="line"><span>    ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐ ┌──────────┐</span></span>
<span class="line"><span>    │ Process │ │Memory│ │ Tool │ │Broker│ │Sched- │ │LLM Agent │</span></span>
<span class="line"><span>    │ Manager │ │ Bus  │ │Router│ │      │ │ uler  │ │+ MCP     │</span></span>
<span class="line"><span>    └─────────┘ └──────┘ └──────┘ └──────┘ └───────┘ └──────────┘</span></span>
<span class="line"><span>                              │                           │</span></span>
<span class="line"><span>                    ┌─────────┘                 ┌─────────┘</span></span>
<span class="line"><span>                    ▼                           ▼</span></span>
<span class="line"><span>              ┌──────────┐              ┌──────────────┐</span></span>
<span class="line"><span>              │ Built-in │              │  MCP Servers  │</span></span>
<span class="line"><span>              │  Tools   │              │ (stdio / SSE) │</span></span>
<span class="line"><span>              └──────────┘              └──────────────┘</span></span></code></pre></div><h2 id="module-responsibilities" tabindex="-1">Module Responsibilities <a class="header-anchor" href="#module-responsibilities" aria-label="Permalink to &quot;Module Responsibilities&quot;">​</a></h2><p><strong>Process Manager</strong> — <code>Kernel</code> owns the <code>Process</code> registry. Each process is an isolated execution unit with its own lifecycle, metadata, and AbortSignal.</p><p><strong>Memory Bus</strong> — Namespaced key-value store. Each process gets an isolated namespace. All processes can access <code>__shared__</code>. Pluggable backends (SQLite, Redis) coming in v0.3.0.</p><p><strong>Tool Router</strong> — Central registry for tools. Handles registration, permission checking, rate limiting, and invocation. Agents declare which tools they can use; the kernel enforces this at execution time.</p><p><strong>Message Broker</strong> — Pub/sub and direct channels for inter-agent communication. Typed messages, configurable history, subscriber error isolation.</p><p><strong>Scheduler</strong> — Multi-strategy task execution: <code>sequential</code>, <code>parallel</code> (layer-based dependency resolution), <code>race</code>, <code>conditional</code>. Supports retry with fixed or exponential backoff.</p><p><strong>LLM Agent</strong> — <code>createLLMAgent()</code> factory that wraps the Anthropic or OpenAI API in an agentic tool loop. Conversation history and token usage are stored in process memory.</p><p><strong>MCP Client</strong> — Connects to MCP servers (stdio or SSE), discovers their tools, and auto-registers them with the <code>ToolRouter</code> as <code>mcp:&lt;server&gt;:&lt;tool&gt;</code>.</p><h2 id="key-data-flows" tabindex="-1">Key Data Flows <a class="header-anchor" href="#key-data-flows" aria-label="Permalink to &quot;Key Data Flows&quot;">​</a></h2><h3 id="spawning-an-agent" tabindex="-1">Spawning an agent <a class="header-anchor" href="#spawning-an-agent" aria-label="Permalink to &quot;Spawning an agent&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>kernel.spawn(&#39;researcher&#39;)</span></span>
<span class="line"><span>  → Validate agent is registered</span></span>
<span class="line"><span>  → Check process limit (maxProcesses)</span></span>
<span class="line"><span>  → Create Process (state: created → running)</span></span>
<span class="line"><span>  → Allocate memory namespace</span></span>
<span class="line"><span>  → Inject __tool_schemas into process memory</span></span>
<span class="line"><span>  → Emit &#39;process:spawned&#39;</span></span>
<span class="line"><span>  → Return Process handle</span></span></code></pre></div><h3 id="executing-a-task" tabindex="-1">Executing a task <a class="header-anchor" href="#executing-a-task" aria-label="Permalink to &quot;Executing a task&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>kernel.execute(proc.id, { task: &#39;...&#39; })</span></span>
<span class="line"><span>  → Validate process is running</span></span>
<span class="line"><span>  → Build ExecutionContext (memory, useTool, publish, emit, signal)</span></span>
<span class="line"><span>  → Emit &#39;execution:started&#39;</span></span>
<span class="line"><span>  → Call agent.handler(ctx)</span></span>
<span class="line"><span>    → ctx.useTool(&#39;x&#39;, params)</span></span>
<span class="line"><span>        → Check agent tool allowlist</span></span>
<span class="line"><span>        → Emit &#39;tool:invoked&#39;</span></span>
<span class="line"><span>        → ToolRouter.invoke() → rate limit → handler()</span></span>
<span class="line"><span>        → Emit &#39;tool:completed&#39;</span></span>
<span class="line"><span>        → Return result</span></span>
<span class="line"><span>    → ctx.publish(&#39;channel&#39;, data)</span></span>
<span class="line"><span>        → MessageBroker.publish()</span></span>
<span class="line"><span>        → Deliver to all channel subscribers</span></span>
<span class="line"><span>        → Emit &#39;message:published&#39;</span></span>
<span class="line"><span>  → Emit &#39;execution:completed&#39;</span></span>
<span class="line"><span>  → Return ExecutionResult</span></span></code></pre></div><h3 id="llm-agentic-loop" tabindex="-1">LLM agentic loop <a class="header-anchor" href="#llm-agentic-loop" aria-label="Permalink to &quot;LLM agentic loop&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>createLLMAgent handler(ctx)</span></span>
<span class="line"><span>  → Load conversation history from ctx.memory.__llm_messages</span></span>
<span class="line"><span>  → Append user message</span></span>
<span class="line"><span>  → Loop up to maxTurns:</span></span>
<span class="line"><span>      → Call Anthropic/OpenAI API with messages + tool schemas</span></span>
<span class="line"><span>      → Emit llm:call, llm:response via ctx.emit()</span></span>
<span class="line"><span>      → If tool_use in response:</span></span>
<span class="line"><span>          → ctx.useTool(name, args) for each tool call</span></span>
<span class="line"><span>          → Append tool results to history</span></span>
<span class="line"><span>      → If text response:</span></span>
<span class="line"><span>          → Set as finalResponse, break</span></span>
<span class="line"><span>  → Save updated history to ctx.memory.__llm_messages</span></span>
<span class="line"><span>  → Return finalResponse</span></span></code></pre></div><h3 id="mcp-tool-discovery" tabindex="-1">MCP tool discovery <a class="header-anchor" href="#mcp-tool-discovery" aria-label="Permalink to &quot;MCP tool discovery&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mcp.connect({ name: &#39;filesystem&#39;, transport: &#39;stdio&#39;, command: &#39;npx&#39;, args: [...] })</span></span>
<span class="line"><span>  → Spawn child process</span></span>
<span class="line"><span>  → JSON-RPC initialize handshake</span></span>
<span class="line"><span>  → tools/list → discover MCPTool[]</span></span>
<span class="line"><span>  → resources/list → discover MCPResource[]</span></span>
<span class="line"><span>  → For each tool:</span></span>
<span class="line"><span>      → Register as ToolDefinition named mcp:filesystem:&lt;tool.name&gt;</span></span>
<span class="line"><span>      → handler: (params) =&gt; mcp.callTool(serverName, tool.name, params)</span></span>
<span class="line"><span>  → Return MCPTool[]</span></span></code></pre></div><h2 id="process-state-machine" tabindex="-1">Process State Machine <a class="header-anchor" href="#process-state-machine" aria-label="Permalink to &quot;Process State Machine&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>         ┌──────────┐</span></span>
<span class="line"><span>         │ Created  │</span></span>
<span class="line"><span>         └────┬─────┘</span></span>
<span class="line"><span>              │ _start()</span></span>
<span class="line"><span>         ┌────▼─────┐</span></span>
<span class="line"><span>         │ Starting │</span></span>
<span class="line"><span>         └────┬─────┘</span></span>
<span class="line"><span>              │ (automatic)</span></span>
<span class="line"><span>         ┌────▼─────┐  _pause()   ┌────────┐</span></span>
<span class="line"><span>         │ Running  │ ──────────► │ Paused │</span></span>
<span class="line"><span>         └────┬─────┘ ◄────────── └────────┘</span></span>
<span class="line"><span>              │         _resume()</span></span>
<span class="line"><span>    ┌─────────┼──────────────┐</span></span>
<span class="line"><span>    │_terminate()            │ _crash(err)</span></span>
<span class="line"><span>    ▼                        ▼</span></span>
<span class="line"><span>┌────────────┐         ┌─────────┐</span></span>
<span class="line"><span>│ Terminated │         │ Crashed │</span></span>
<span class="line"><span>└────────────┘         └─────────┘</span></span></code></pre></div><p>Terminal states: <code>terminated</code> and <code>crashed</code>. No restart from either — spawn a new process. Checkpointing (v0.3.0) will enable crash recovery.</p><p>See <a href="./../rfcs/RFC-001-PROCESS-STATE-MACHINE.html">RFC-001</a> for the full state machine specification.</p><h2 id="memory-architecture" tabindex="-1">Memory Architecture <a class="header-anchor" href="#memory-architecture" aria-label="Permalink to &quot;Memory Architecture&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    MemoryBus</span></span>
<span class="line"><span>          ┌─────────────────────────────┐</span></span>
<span class="line"><span>          │                             │</span></span>
<span class="line"><span>  proc-a  │  namespace: &quot;proc-a&quot;        │  ← isolated, deleted on terminate</span></span>
<span class="line"><span>          │  { key → MemoryEntry }      │</span></span>
<span class="line"><span>          │                             │</span></span>
<span class="line"><span>  proc-b  │  namespace: &quot;proc-b&quot;        │  ← isolated, deleted on terminate</span></span>
<span class="line"><span>          │  { key → MemoryEntry }      │</span></span>
<span class="line"><span>          │                             │</span></span>
<span class="line"><span>  anyone  │  namespace: &quot;__shared__&quot;    │  ← cross-process, kernel lifetime</span></span>
<span class="line"><span>          │  { key → MemoryEntry }      │</span></span>
<span class="line"><span>          └─────────────────────────────┘</span></span></code></pre></div><p>Reserved keys (set by AgentVM internals, prefixed <code>__</code>):</p><ul><li><code>__tool_schemas</code> — injected at spawn, consumed by <code>createLLMAgent()</code></li><li><code>__llm_messages</code> — conversation history for multi-turn LLM agents</li><li><code>__llm_usage</code> — cumulative <code>{ inputTokens, outputTokens }</code> per process</li></ul><p>See <a href="./../rfcs/RFC-002-MEMORY-BUS-INTERFACE.html">RFC-002</a> for the full memory contract.</p><h2 id="event-system" tabindex="-1">Event System <a class="header-anchor" href="#event-system" aria-label="Permalink to &quot;Event System&quot;">​</a></h2><p>Every operation emits a <code>KernelEvent</code>:</p><div class="language-typescript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">typescript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">interface</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> KernelEvent</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  id</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// &quot;evt-&lt;timestamp&gt;-&lt;random&gt;&quot;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  type</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// e.g. &#39;process:spawned&#39;, &#39;tool:invoked&#39;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  source</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// kernel name</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  timestamp</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Date</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  data</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">?:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> unknown</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// event-specific payload</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p>Subscribe with <code>kernel.on(type, handler)</code> or <code>kernel.onAny(handler)</code>. Handler errors are swallowed — a broken logger cannot crash the kernel.</p><p>See <a href="./../rfcs/RFC-003-EVENT-SCHEMA.html">RFC-003</a> for the full event catalog and payload shapes.</p><h2 id="source-layout" tabindex="-1">Source Layout <a class="header-anchor" href="#source-layout" aria-label="Permalink to &quot;Source Layout&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>src/</span></span>
<span class="line"><span>  core/</span></span>
<span class="line"><span>    kernel.ts       ← Kernel: orchestrator, spawn, execute, events</span></span>
<span class="line"><span>    agent.ts        ← Agent: definition, name validation</span></span>
<span class="line"><span>    process.ts      ← Process: state machine, AbortController, metadata</span></span>
<span class="line"><span>    types.ts        ← All shared interfaces and enums</span></span>
<span class="line"><span>  memory/</span></span>
<span class="line"><span>    bus.ts          ← MemoryBus + MemoryStore (in-memory backend)</span></span>
<span class="line"><span>  tools/</span></span>
<span class="line"><span>    router.ts       ← ToolRouter: registry, invoke, rate limiting, errors</span></span>
<span class="line"><span>  broker/</span></span>
<span class="line"><span>    broker.ts       ← MessageBroker + Channel: pub/sub, direct, history</span></span>
<span class="line"><span>  scheduler/</span></span>
<span class="line"><span>    scheduler.ts    ← Scheduler: strategies, dependency layers, retry</span></span>
<span class="line"><span>  llm/</span></span>
<span class="line"><span>    agent.ts        ← createLLMAgent(), createPipeline(), Anthropic+OpenAI adapters</span></span>
<span class="line"><span>  mcp/</span></span>
<span class="line"><span>    client.ts       ← MCPClient: stdio/SSE transports, JSON-RPC, tool bridge</span></span>
<span class="line"><span>  builtins/</span></span>
<span class="line"><span>    tools.ts        ← http_fetch, json_fetch, shell_exec, file_read, file_write, wait</span></span>
<span class="line"><span>  cli/</span></span>
<span class="line"><span>    index.ts        ← CLI entry point (commander)</span></span>
<span class="line"><span>    commands/       ← init, start, spawn, ps, kill, logs</span></span>
<span class="line"><span>  index.ts          ← Public API surface</span></span></code></pre></div>`,38)])])}const g=a(i,[["render",t]]);export{u as __pageData,g as default};
