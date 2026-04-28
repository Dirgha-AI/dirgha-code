# Running Dirgha against a local LLM

Dirgha CLI works with any OpenAI-compatible endpoint, including local model runners. Two officially-tested paths:

- **Ollama** (recommended for most users — easiest to install)
- **llama.cpp** (server mode — bare-metal, smaller footprint)

`dirgha doctor` probes both endpoints automatically. When a local server is running, you'll see a green check next to its line:

```
$ dirgha doctor
✓ Ollama        http://localhost:11434/api/tags (200)
⚠ llama.cpp     http://localhost:8080/v1/models (HTTP 404)
```

## Why run locally?

- **Privacy** — prompts never leave your machine.
- **Cost** — no API spend after the model is downloaded.
- **Offline** — works on a plane, on a closed network.
- **Custom fine-tunes** — point at your own checkpoint.

The trade-off: smaller open-weight models are usually 1–2 quality tiers below GPT-5 / Claude Opus / Gemini 2.5 Pro on hard reasoning. For routine code edits, refactors, and tool calls, a 7B–14B parameter model run locally is excellent.

## Quick start — Ollama

```bash
# 1. Install Ollama (Linux / macOS one-liner; Windows: see ollama.com)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model. ~2 GB, takes a few minutes the first time.
ollama pull llama3.2:3b

# 3. Confirm Ollama is reachable
dirgha doctor | grep -i ollama
# → ✓ Ollama  http://localhost:11434/api/tags (200)

# 4. Tell Dirgha to use the local model
export DIRGHA_MODEL=llama3.2:3b
dirgha
# (REPL launches, model id in status bar = llama3.2:3b)

# 5. Or for a one-shot:
dirgha ask --model=llama3.2:3b "summarise this README in 5 lines"
```

Persist the choice across sessions with `dirgha keys set DIRGHA_LOCAL_MODEL llama3.2:3b` — the `models default` flow then offers it as the default.

## Recommended Ollama models for coding

| Model | Size | Quality | Notes |
|---|---|---|---|
| `qwen2.5-coder:7b` | 4.7 GB | Strong | Coding-tuned; the standout small open-weight model for tool-use tasks. |
| `llama3.2:3b` | 2.0 GB | Decent | Smallest model that still handles dirgha's tool-call format reliably. |
| `deepseek-coder:6.7b` | 3.8 GB | Strong | Excellent at code refactor + diff-style edits. |
| `qwen2.5:14b` | 9.0 GB | Very strong | Closest small-model to frontier quality; needs 16GB RAM. |
| `llama3.3:70b` | 42 GB | Frontier-adjacent | If you have a Mac Studio or a 4090. |

## Quick start — llama.cpp server

```bash
# 1. Build llama.cpp (https://github.com/ggerganov/llama.cpp)
git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp
make -j

# 2. Download a GGUF model (e.g. from huggingface.co/bartowski)
wget https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf

# 3. Start the OpenAI-compatible server
./llama-server -m Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf --port 8080

# 4. Confirm Dirgha sees it
dirgha doctor | grep -i llama.cpp
# → ✓ llama.cpp  http://localhost:8080/v1/models (200)

# 5. Use it
DIRGHA_MODEL=qwen2.5-coder dirgha
```

## Tool-use compatibility note

Not every local model handles function calls / tool calls reliably. The good news: dirgha's tool dispatcher accepts both **structured tool_calls** (modern OpenAI-compatible) AND **JSON-in-content** fallback (parses tool calls written as JSON in the assistant text). So even a model that doesn't natively emit tool_calls can still drive dirgha's tools, just less consistently.

Models verified to work well with dirgha's tool surface:
- `qwen2.5-coder:*` (any size)
- `deepseek-coder:*`
- `llama3.2:3b` (best of the small ones)
- `gpt-oss:120b` (frontier open-weight when run on suitable hardware)

## Endpoint override

If your local server isn't on the default port, override per-call:

```bash
DIRGHA_LOCAL_BASE_URL=http://192.168.1.50:8080/v1 \
DIRGHA_MODEL=qwen2.5-coder \
dirgha
```

## Verifying it's actually local

Want to prove no traffic leaves your machine? Two options:

```bash
# Option 1: turn off the router. If dirgha still answers, it's local.

# Option 2: pf / iptables a deny rule on outbound 443 just for the dirgha PID
sudo strace -e network -p $(pgrep -f 'dirgha\b' | head -1)
# Watch for connect() calls — should only be 127.0.0.1.
```

## Cost — actually zero

`dirgha cost` for local-model runs reports `$0.000` because the model catalogue's price for `local/*` and your DIRGHA_LOCAL_MODEL slot is set to zero. The audit log still records token counts so you can see throughput.

## Troubleshooting

**`dirgha doctor` shows ⚠ Ollama not running**
→ `ollama serve` (or restart the Ollama desktop app on macOS).

**Model responds but ignores tool calls**
→ Smaller models (1B–3B) sometimes drop tool-call JSON formatting. Try a 7B+ model OR set `DIRGHA_TOOLS_INLINE_JSON=1` to enable the JSON-in-content fallback.

**Slow responses on first run**
→ Ollama loads the model into RAM on first call after start. Subsequent calls are fast.

**Out of memory**
→ Pick a smaller quantization (`:q4_K_M` instead of `:q8_0` GGUF) or a smaller param count (3b instead of 7b).
