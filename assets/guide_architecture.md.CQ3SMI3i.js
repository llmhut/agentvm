import{_ as s,o as n,c as e,ag as t}from"./chunks/framework.C9sp7nFj.js";const h=JSON.parse('{"title":"Architecture","description":"","frontmatter":{},"headers":[],"relativePath":"guide/architecture.md","filePath":"guide/architecture.md"}'),p={name:"guide/architecture.md"};function i(r,a,l,o,c,u){return n(),e("div",null,[...a[0]||(a[0]=[t(`<h1 id="architecture" tabindex="-1">Architecture <a class="header-anchor" href="#architecture" aria-label="Permalink to &quot;Architecture&quot;">​</a></h1><p>For the full architecture document, see <a href="https://github.com/llmhut/agentvm/blob/main/docs/architecture/OVERVIEW.md" target="_blank" rel="noreferrer">Architecture Overview</a>.</p><h2 id="design-principles" tabindex="-1">Design Principles <a class="header-anchor" href="#design-principles" aria-label="Permalink to &quot;Design Principles&quot;">​</a></h2><ol><li><strong>Modular</strong> — Every component is independent and replaceable</li><li><strong>Event-driven</strong> — All operations emit structured events</li><li><strong>Framework-agnostic</strong> — No opinions about LLMs or agent frameworks</li><li><strong>Async-first</strong> — All I/O is non-blocking</li><li><strong>Type-safe</strong> — Full TypeScript with strict mode</li></ol><h2 id="component-map" tabindex="-1">Component Map <a class="header-anchor" href="#component-map" aria-label="Permalink to &quot;Component Map&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Kernel (orchestrator)</span></span>
<span class="line"><span>├── Process Manager — spawn, pause, resume, terminate</span></span>
<span class="line"><span>├── MemoryBus — pluggable backends (InMemory, SQLite)</span></span>
<span class="line"><span>├── ToolRouter — registry, permissions, rate limits</span></span>
<span class="line"><span>├── MessageBroker — pub/sub, direct, priority queues</span></span>
<span class="line"><span>├── Scheduler — sequential, parallel, race, conditional</span></span>
<span class="line"><span>├── LLM Agent — Anthropic + OpenAI with tool loops</span></span>
<span class="line"><span>├── MCP Client — stdio + SSE transport</span></span>
<span class="line"><span>├── Contracts — runtime input/output validation</span></span>
<span class="line"><span>├── Checkpointing — serialize/restore process state</span></span>
<span class="line"><span>└── Config — YAML config loader</span></span></code></pre></div><h2 id="data-flow" tabindex="-1">Data Flow <a class="header-anchor" href="#data-flow" aria-label="Permalink to &quot;Data Flow&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>kernel.execute(processId, { task: &#39;work&#39; })</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ├── validate input (contract)</span></span>
<span class="line"><span>  ├── build ExecutionContext (memory, tools, messaging)</span></span>
<span class="line"><span>  ├── call handler(ctx)</span></span>
<span class="line"><span>  │     ├── ctx.memory.get/set (→ MemoryBus → Backend)</span></span>
<span class="line"><span>  │     ├── ctx.useTool (→ ToolRouter → handler)</span></span>
<span class="line"><span>  │     ├── ctx.publish (→ MessageBroker → subscribers)</span></span>
<span class="line"><span>  │     └── return output</span></span>
<span class="line"><span>  ├── validate output (contract)</span></span>
<span class="line"><span>  ├── check SLA (latency)</span></span>
<span class="line"><span>  ├── read __llm_usage (token tracking)</span></span>
<span class="line"><span>  └── return ExecutionResult</span></span></code></pre></div>`,8)])])}const g=s(p,[["render",i]]);export{h as __pageData,g as default};
