<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# CLI_POSITIONING.md

## Comparative Analysis of 9 Developer CLIs (2026)

| CLI | Hero one-liner | Install command | First 3 quickstart commands shown in README | Top-level command tree | License badge style |
|-----|---------------|-----------------|-------------------------------------------|------------------------|---------------------|
| **claude-code** (Anthropic) | "Agentic coding partner in your terminal" | `npm install -g @anthropic-ai/claude-code` | `claude`, `claude config set apiKey <key>`, `claude init` | `chat`, `config`, `init`, `status`, `help` | Black badge with white "Anthropic" text, proprietary |
| **cursor** | "The AI-native code editor, now in CLI" | `curl -fsSL cursor.sh/install.sh \| sh` | `cursor login`, `cursor open .`, `cursor agent --task "refactor auth"` | `open`, `agent`, `deploy`, `config`, `sync`, `logs` | Blue gradient badge with "Cursor" wordmark, proprietary |
| **gh** (GitHub) | "GitHub’s official command line tool" | `brew install gh` | `gh auth login`, `gh repo clone owner/repo`, `gh pr create` | `auth`, `repo`, `pr`, `issue`, `codespace`, `run`, `release`, `gist` | Gray badge with "MIT" in white text |
| **kubectl** | "The Kubernetes command-line tool" | `brew install kubectl` | `kubectl cluster-info`, `kubectl get pods`, `kubectl apply -f deployment.yaml` | `get`, `describe`, `apply`, `delete`, `logs`, `exec`, `port-forward`, `config` | Blue badge with "Apache-2.0" |
| **wrangler** (Cloudflare) | "Cloudflare Workers CLI—build, test, deploy" | `npm install -g wrangler` | `wrangler login`, `wrangler init my-app`, `wrangler deploy` | `init`, `dev`, `deploy`, `tail`, `secret`, `kv`, `d1`, `r2`, `pages` | Orange badge with "MIT" |
| **supabase** | "Supabase CLI for local development and management" | `npm install -g supabase` | `supabase login`, `supabase init`, `supabase start` | `init`, `start`, `stop`, `db`, `functions`, `storage`, `migration`, `seed`, `link` | Green badge with "Apache-2.0" |
| **vercel** | "Vercel CLI for deployment and infrastructure" | `npm i -g vercel` | `vercel login`, `vercel` (deploy), `vercel --prod` | `deploy`, `dev`, `env`, `logs`, `project`, `teams`, `billing`, `domains` | Black badge with white "Proprietary" text |
| **railway** | "Deploy infrastructure to the cloud" | `npm i -g @railway/cli` | `railway login`, `railway init`, `railway up` | `up`, `down`, `status`, `logs`, `variables`, `add`, `connect`, `shell` | Pink badge with "MIT" |
| **aider** | "AI pair programming in your terminal" | `pip install aider-chat` | `aider --model gpt-4`, `aider src/utils.ts`, `/commit` (interactive) | Interactive: `/add`, `/drop`, `/commit`, `/help`, `/model`, `/test`, `/undo`, `/voice` | Blue badge with "Apache-2.0" |

## Three Structural Patterns Dirgha Code Should Steal

### 1. The "Zero-to-Value" README Hero & Quickstart Cadence (from claude-code, wrangler, supabase)

The most successful 2026 CLIs treat the README as a conversion funnel, not documentation. **Dirgha Code** should adopt the **three-tier hero pattern**:

- **Tier 1 (The Hook):** A single ASCII art header or emoji-rich one-liner above the fold that communicates the CLI's unique value proposition—e.g., "Autonomous coding agent for 2-core VPSs"—followed immediately by a copy-paste install command using either `npm -g` or a curl-to-bash pipe. This eliminates friction for the "just browsing" developer.

- **Tier 2 (The 30-Second Win):** Three commands that demonstrate core value without configuration: `dirgha init`, `dirgha auth`, `dirgha agent "fix TypeScript errors"`. These must be copy-pasteable and produce visible output (file changes, git commits, or browser screenshots) within 30 seconds. Supabase excels here with `supabase start` spinning up Docker in one command.

- **Tier 3 (Progressive Disclosure):** After the quickstart, a "Next Steps" section with three links: Tutorial (narrative), Cookbook (copy-paste recipes), and Reference (complete flag list). This mirrors Wrangler's documentation taxonomy and prevents cognitive overload while maintaining SEO juice.

Crucially, the install command should detect the environment (macOS vs. Linux vs. WSL) and suggest the appropriate package manager, as Cursor's install script does, rather than forcing the user to choose.

### 2. Hierarchical Help-Flag Philosophy & Shell Completion (from kubectl, gh, aider)

**Dirgha Code** must treat help flags as a navigational taxonomy, not an afterthought. Adopt **three-level help granularity**:

- **Level 1:** `dirgha --help` shows only top-level commands (8-10 items) grouped by function (e.g., "Core", "Browser", "Memory", "Config"), mirroring kubectl's resource categorization.
- **Level 2:** `dirgha browser --help` shows subcommands and global flags, but not subcommand flags—preventing scroll fatigue.
- **Level 3:** `dirgha browser act --help` shows full flag documentation, environment variables, and examples.

Implement **generated shell completions** via a `dirgha completion [bash|zsh|fish|powershell]` command that outputs to stdout, allowing users to pipe directly to their shell config (`dirgha completion zsh > ~/.zshrc`). This pattern, standard in gh and kubectl, ensures completions stay synchronized with binary updates.

Adopt **strict flag naming conventions**: kebab-case only (`--memory-limit`), no short flags for destructive actions (no `-f` for `delete`), and mandatory `--dry-run` flags for any command that mutates filesystem or remote state. Aider's interactive slash-command model (`/add`, `/drop`) should be reserved for the REPL mode, while the standard CLI uses POSIX-compliant flags.

### 3. JSON-Output Discipline & Machine-Readable Logs (from gh, kubectl, wrangler)

Every Dirgha Code command must support `--output json` (aliased to `-o json`) for programmatic consumption. This is not merely about piping to `jq`; it requires **structured result schemas**:

- **Success:** Exit code 0, JSON envelope `{"status": "success", "data": {...}, "meta": {"duration_ms": 124}}`
- **Error:** Exit code 1, envelope `{"status": "error", "error": {"code": "BROWSER_TIMEOUT", "message": "..."}}`
- **Partial Success:** Exit code 3 (distinct from 1) for batch operations where 2/3 files succeeded, with `{"status": "partial", "completed": [...], "failed": [...]}`

Follow **graceful degradation for TTY detection**: In interactive mode, show spinners and progress bars; in non-TTY (CI/CD), emit newline-delimited JSON (NDJSON) streams with `{"type": "progress", "percent": 0.5}` events, then final result. Wrangler's `wrangler deploy --output json` exemplifies this for CI pipelines.

Implement **structured logging** via `--log-format json` and `--log-level [debug|info|warn|error]`, writing to stderr while stdout remains pure for data piping. This allows users to debug agent loops without polluting their shell scripts, matching kubectl's `--v=6` verbosity flags.

Finally, adopt **exit code discipline**: 0 (success), 1 (general error), 2 (misuse/missing args), 3 (partial failure), 130 (SIGINT). This enables reliable scripting in `set -e` environments.

*Source of truth as of 2026-04-17. License badges reflect 2026 branding standards.*