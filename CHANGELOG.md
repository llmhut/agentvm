# Changelog

All notable changes to AgentKernel will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project scaffolding
- `Kernel` class — agent registration, process lifecycle, event system
- `Agent` class — typed agent definitions with validation
- `Process` class — state machine (created → running → paused → terminated/crashed)
- `MemoryBus` — namespaced in-memory key-value store with shared memory
- `ToolRouter` — tool registration, invocation, rate limiting
- `MessageBroker` — pub/sub channels, direct messaging, message history
- `Scheduler` — sequential, parallel, race, conditional execution strategies
- CLI scaffolding
- Unit tests for all core modules
- Architecture documentation and RFC-001 (Process State Machine)
- Contributing guide, Code of Conduct, MIT License
- GitHub Actions CI/CD workflows
- 3 example projects (hello-world, multi-agent, memory-demo)
- Getting Started guide
