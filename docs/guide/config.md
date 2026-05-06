# Config System

Define agents, tools, and channels in a YAML file instead of TypeScript.

## agentvm.yml

```yaml
name: my-app
debug: false

memory:
  backend: sqlite
  path: ./data/agentvm.db

agents:
  researcher:
    description: Researches topics
    tools: [http_fetch, json_fetch]
    memory:
      persistent: true

tools:
  - http_fetch
  - json_fetch

channels:
  updates:
    type: pubsub
    historyLimit: 100

env:
  name: AGENTVM_NAME
```

## Loading Config

```typescript
import { loadConfig } from '@llmhut/agentvm';

const config = loadConfig('./agentvm.yml');
// config.name, config.agents, config.tools, config.channels
```

## Environment Overrides

The `env` section maps config paths to environment variables:

```yaml
env:
  name: APP_NAME
  memory.path: DB_PATH
```

```bash
APP_NAME=production DB_PATH=./prod.db npx tsx app.ts
```

## Validation

```typescript
import { validateConfig, ConfigValidationError } from '@llmhut/agentvm';

const errors = validateConfig(config);
// Returns string[] of issues, empty if valid
```
