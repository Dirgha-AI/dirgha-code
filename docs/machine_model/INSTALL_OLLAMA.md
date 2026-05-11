# Machine 1 — Ollama Setup Guide

Machine 1 is Dirgha's local industrial intelligence model. It runs entirely
on your machine via Ollama and is augmented at query time with entries from
the Dirgha Codex stored in Qdrant.

---

## 1. Install Ollama

### Linux / macOS (one-liner)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### macOS (Homebrew)

```bash
brew install ollama
ollama serve   # starts the daemon on http://localhost:11434
```

### Windows

Download the installer from https://ollama.com/download and run it.
Ollama starts automatically as a background service.

Verify:

```bash
ollama --version
# ollama version X.Y.Z
```

---

## 2. Pull the embedding model (required for Codex retrieval)

The provider uses `nomic-embed-text` to embed queries before searching Qdrant.

```bash
ollama pull nomic-embed-text
```

---

## 3. Create the Machine 1 model

### Option A — from a GGUF file (production path)

Place your quantised GGUF at `~/.ollama/machine1-q4_k_m.gguf` (or any path),
then update the `FROM` line in `Modelfile` to match, and run:

```bash
cd /path/to/dirgha-code-release/docs/machine_model
ollama create machine1 -f Modelfile
```

Verify:

```bash
ollama list
# NAME               ID              SIZE    MODIFIED
# machine1:latest    ...             ...     ...
```

### Option B — from base model (development / demo)

If you don't have the GGUF yet, bootstrap from `qwen2.5:0.5b` as a placeholder:

```bash
ollama pull qwen2.5:0.5b
```

The provider will auto-detect that `machine1` is absent and fall back to
`qwen2.5:0.5b` with a warning in the CLI.

---

## 4. Start Qdrant (for Codex retrieval)

Qdrant must be running at `http://localhost:6333`.

```bash
docker run -d --name qdrant \
  -p 6333:6333 \
  -v ~/.qdrant/storage:/qdrant/storage \
  qdrant/qdrant
```

Or with the Qdrant CLI:

```bash
pip install qdrant-client
# then ingest your Codex JSONL — see docs/codex/INGEST.md
```

The provider tries the collection names `codex` and `dirgha_codex` in that
order and uses the first one it finds. If neither exists, the model still
answers — just without Codex context.

---

## 5. Test the model directly

```bash
ollama run machine1 "What is a CNC horizontal machining centre?"
```

Expected output pattern:

```
A CNC horizontal machining centre (HMC) performs multi-face milling,
drilling, boring, and tapping on prismatic parts using a horizontal spindle.
Spindle speeds typically range up to 12,000 RPM with a positioning accuracy
of ±2 µm. India imports ~85% of HMCs; domestic producers include ACE
Micromatic and Bharat Fritz Werner. Sovereignty score: 7/27.
```

---

## 6. Use Machine 1 in the Dirgha CLI

```bash
# Ask a question
dirgha ask --model machine1 "Explain the role of BHEL in steam turbine manufacturing"

# Interactive session
dirgha chat --model machine1

# One-shot non-interactive
echo "What is a wire EDM machine?" | dirgha ask --model machine1 --stdin
```

The CLI will display `[Machine 1]` at the start of every response so you
always know which model answered.

If `machine1` is not found in Ollama, the provider falls back to
`qwen2.5:0.5b` and prepends a warning line.

---

## 7. Routing rules

The dispatch table routes the following model IDs to the Machine 1 provider:

| Model ID          | Notes                    |
|-------------------|--------------------------|
| `machine1`        | canonical                |
| `machine1:latest` | Ollama tag form          |
| `machine1/*`      | any sub-variant          |

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `[Machine 1] Warning: model "machine1" not found` | Run `ollama create machine1 -f Modelfile` |
| Empty Codex context | Start Qdrant on port 6333 and ingest the Codex |
| Slow TTFT | Reduce `num_ctx` in Modelfile (e.g., 2048) |
| OOM / crash | Use a smaller quant: `q2_k` instead of `q4_k_m` |
