# Dirgha Extension API

## Quick start

Create `~/.dirgha/extensions/my-ext/manifest.json`:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Custom tools for my team",
  "hooks": ["beforeTurn", "afterToolCall"],
  "tools": ["./tools/custom-tool.js"]
}
```

Create `~/.dirgha/extensions/my-ext/index.js`:

```js
export function beforeTurn(messages, session) {
  // Add a system reminder before each turn
  const reminder = { role: "system", content: "Use TypeScript strict mode." };
  return [reminder, ...messages];
}

export function afterToolCall(result) {
  // Log every shell command
  if (result.tool === "shell") {
    console.log(`[ext] shell ran: ${result.input.command.slice(0, 80)}`);
  }
  return result;
}
```

## Tool extension example

Create `~/.dirgha/extensions/my-ext/tools/deploy.js`:

```js
import { execSync } from "child_process";

export const deployTool = {
  name: "deploy",
  description: "Deploy the current project to staging",
  parameters: {
    type: "object",
    properties: {
      environment: {
        type: "string",
        enum: ["staging", "production"],
        description: "Target environment",
      },
    },
    required: ["environment"],
  },
  async execute(params, context) {
    const env = params.environment;
    const result = execSync(`npm run deploy:${env}`, { encoding: "utf8" });
    return { success: true, output: result };
  },
};
```

## Available hooks

| Hook            | Signature                                                      | Description                     |
| --------------- | -------------------------------------------------------------- | ------------------------------- |
| `beforeTurn`    | `(messages: Message[], session: Session) => Message[] \| void` | Mutate messages before LLM call |
| `afterToolCall` | `(result: ToolResult) => ToolResult \| void`                   | Post-process tool results       |
| `onError`       | `(error: Error, context: AgentContext) => boolean \| void`     | Return `true` to suppress error |
| `onStart`       | `(config: AgentConfig) => void`                                | Agent session started           |
| `onStop`        | `(reason: string) => void`                                     | Agent session ended             |
| `onSessionSave` | `(session: Session) => void`                                   | Session persisted to disk       |

## Context injection example

```js
export async function onStart(config) {
  // Check if the project has a particular setup
  const hasDocker = execSync("which docker", { stdio: "pipe" });
  config.systemPrompt += hasDocker
    ? "\nDocker is available. Use it for isolated testing."
    : "";
}
```

## Publishing extensions

Extensions are plain JavaScript/TypeScript modules. Publish them as npm packages:

```json
{
  "name": "dirgha-extension-my-tools",
  "version": "1.0.0",
  "main": "index.js",
  "keywords": ["dirgha", "dirgha-extension"]
}
```

Users install with:

```bash
mkdir -p ~/.dirgha/extensions/my-tools
cd ~/.dirgha/extensions/my-tools
npm init -y && npm install dirgha-extension-my-tools
```

## Extension best practices

- **No side effects at import time.** Execute in hooks, not at module scope.
- **Handle missing deps gracefully.** Use dynamic `import()` for optional deps.
- **Respect `DIRGHA_TELEMETRY_DEBUG` env.** Use it for diagnostic logging, keep quiet by default.
- **Return the original result** from `afterToolCall` unless you explicitly intend to transform it.
- **Test extensions in isolation.** Create a test `DIRGHA.md` in a temp directory.
