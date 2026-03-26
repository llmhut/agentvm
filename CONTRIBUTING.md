# Contributing to AgentKernel

First off — thank you! AgentKernel is built by the community and every contribution matters.

## Quick Links

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Roadmap](ROADMAP.md)
- [Architecture Docs](docs/architecture/)
- [Open Issues](https://github.com/llmhut/agentkernel/issues)

---

## Ways to Contribute

### 🐛 Report Bugs
Found something broken? Open an issue using the **Bug Report** template.

### 💡 Request Features
Have an idea? Open a Discussion in the "Feature Requests" category. If it's an architectural change, consider writing an RFC.

### 🔧 Submit Code
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write your code with tests
4. Run the test suite: `npm test`
5. Run the linter: `npm run lint`
6. Submit a PR using the PR template

### 📝 Improve Docs
Documentation PRs are always welcome. Fix typos, clarify explanations, add examples.

### 📐 Write RFCs
For significant changes, write an RFC in `docs/rfcs/`. Use the template at `docs/rfcs/RFC-000-TEMPLATE.md`.

---

## Development Setup

### Prerequisites
- Node.js >= 20
- npm >= 10
- Git

### Getting Started

```bash
# Clone the repo
git clone https://github.com/llmhut/agentkernel.git
cd agentkernel

# Install dependencies
npm install

# Run tests
npm test

# Run in development mode
npm run dev

# Build
npm run build

# Lint
npm run lint
```

---

## Code Style

- **TypeScript** — strict mode, no `any` unless absolutely necessary
- **Naming** — `camelCase` for variables/functions, `PascalCase` for classes/types, `UPPER_SNAKE` for constants
- **Files** — `kebab-case.ts` for filenames
- **Tests** — co-located in `tests/` mirroring `src/` structure, use Vitest
- **Comments** — JSDoc for all public APIs, inline comments for non-obvious logic
- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)

---

## Pull Request Guidelines

1. **One concern per PR.** Don't mix features with refactors.
2. **Tests required.** New features need tests. Bug fixes need a regression test.
3. **Docs updated.** If you change the API, update the docs.
4. **Passing CI.** All checks must pass before review.
5. **Descriptive title.** Use conventional commit format: `feat: add process pause/resume`
6. **Link issues.** Reference the issue your PR addresses: `Closes #42`

---

## RFC Process

RFCs (Request for Comments) are how we make architectural decisions.

**When to write an RFC:**
- Adding a new core module
- Changing a public API
- Introducing a new dependency
- Modifying the process lifecycle
- Any change that affects multiple modules

**RFC Lifecycle:**
1. `draft` — Author is writing, not ready for review
2. `review` — Open for community feedback
3. `accepted` — Approved by maintainers
4. `implemented` — Code has been merged
5. `rejected` — Not moving forward (with reasons documented)

---

## Issue Labels

| Label | Description |
|-------|-------------|
| `good-first-issue` | Great for newcomers |
| `help-wanted` | Looking for contributors |
| `bug` | Something is broken |
| `enhancement` | New feature request |
| `docs` | Documentation improvement |
| `rfc` | Requires an RFC before implementation |
| `phase-1` / `phase-2` / etc. | Roadmap phase |
| `core` / `memory` / `tools` / `broker` / `scheduler` | Module area |

---

## Community

- Be kind. Be constructive. Assume good intent.
- Help others in issues and discussions.
- Credit contributors in release notes.

Thank you for helping build the foundation of agentic AI. 🔩
