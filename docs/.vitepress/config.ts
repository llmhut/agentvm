import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'AgentVM',
  description: 'The runtime your AI agents deserve',
  base: '/',

  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
  ],

  themeConfig: {
    logo: '/logo-small.png',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/kernel' },
      { text: 'Integrations', link: '/integrations/overview' },
      {
        text: 'v0.3.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
      { text: 'GitHub', link: 'https://github.com/llmhut/agentvm' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is AgentVM?', link: '/guide/what-is-agentvm' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
          ],
        },
        {
          text: 'Essentials',
          items: [
            { text: 'Agents & Processes', link: '/guide/agents' },
            { text: 'Tools', link: '/guide/tools' },
            { text: 'Memory', link: '/guide/memory' },
            { text: 'Messaging', link: '/guide/messaging' },
            { text: 'LLM Agents', link: '/guide/llm-agents' },
            { text: 'MCP Integration', link: '/guide/mcp' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Contracts & Validation', link: '/guide/contracts' },
            { text: 'Checkpointing', link: '/guide/checkpointing' },
            { text: 'Config System', link: '/guide/config' },
            { text: 'Scheduler', link: '/guide/scheduler' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Core',
          items: [
            { text: 'Kernel', link: '/api/kernel' },
            { text: 'Agent', link: '/api/agent' },
            { text: 'Process', link: '/api/process' },
          ],
        },
        {
          text: 'Modules',
          items: [
            { text: 'MemoryBus', link: '/api/memory' },
            { text: 'ToolRouter', link: '/api/tools' },
            { text: 'MessageBroker', link: '/api/broker' },
            { text: 'Scheduler', link: '/api/scheduler' },
          ],
        },
        {
          text: 'LLM & MCP',
          items: [
            { text: 'createLLMAgent', link: '/api/llm-agent' },
            { text: 'MCPClient', link: '/api/mcp-client' },
            { text: 'Built-in Tools', link: '/api/builtins' },
          ],
        },
        {
          text: 'Utilities',
          items: [
            { text: 'Contracts', link: '/api/contracts' },
            { text: 'Checkpointing', link: '/api/checkpointing' },
            { text: 'Config Loader', link: '/api/config' },
            { text: 'Adapters', link: '/api/adapters' },
          ],
        },
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          items: [
            { text: 'Overview', link: '/integrations/overview' },
            { text: 'LangChain.js', link: '/integrations/langchain' },
            { text: 'Vercel AI SDK', link: '/integrations/vercel-ai-sdk' },
            { text: 'OpenAI & Anthropic', link: '/integrations/openai-anthropic' },
            { text: 'MCP Server', link: '/integrations/mcp-server' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/llmhut/agentvm' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@llmhut/agentvm' },
    ],

    editLink: {
      pattern: 'https://github.com/llmhut/agentvm/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 LLMHut',
    },
  },
});
