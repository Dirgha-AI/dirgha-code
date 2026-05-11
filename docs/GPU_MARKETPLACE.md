# GPU Marketplace — Dirgha CLI

## Overview

The GPU marketplace lets you provision GPU compute instances from 4 providers
(Vast, Akash, Spheron, RunPod) directly from the CLI, agent, or web UI.

### Two billing modes

| Mode | Description | Price |
|------|-------------|-------|
| **BYOK** | Use your own API keys. Pay providers directly. | $0 platform fee |
| **Managed** | Use our gateway. We provision with our keys, deduct from credits. | Provider cost × 1.2 (20% margin) |

### 4 providers, cheapest auto-selected

| Provider | A100 80GB/hr | Notes |
|----------|-------------|-------|
| Vast.ai | $0.45 | Marketplace pricing, cheapest |
| Akash | $0.28 | Decentralized cloud, cheapest A100 |
| Spheron | $0.35 | Decentralized GPU compute |
| RunPod | $0.49 | Most reliable, primary provider |

The `gpu_compute` tool auto-selects the cheapest GPU that meets your requirements.

## CLI Usage

```bash
# List available GPU types and prices
dirgha gpu list

# Provision a GPU (auto-selects cheapest)
dirgha gpu deploy --gpu "A100 80GB" --image pytorch/pytorch:latest

# Check status
dirgha gpu status <instance-id>

# View job history
dirgha gpu jobs

# Set monthly budget
dirgha gpu budget 50

# View audit log
dirgha gpu audit

# Browse marketplace listings
dirgha gpu market list

# List your GPU for rent
dirgha gpu market post "NVIDIA RTX 4090" 0.35
```

### Agent tools

The agent can provision GPUs automatically:

```
dirgha ask "fine-tune Llama 4 on my dataset"
  → Agent: gpu_compute
  → Auto-selects cheapest GPU meeting VRAM requirements
  → Provisions instance
  → Runs training
  → Returns result
  → Destroys instance
```

| Tool | Description |
|------|-------------|
| `gpu_list` | List available GPU types across all providers |
| `gpu_compute` | Provision GPU, run job, auto-destroy |
| `gpu_status` | Check running instance status |
| `gpu_destroy` | Terminate instance, stop billing |
| `gpu_market_list` | Browse marketplace listings |
| `gpu_market_post` | List GPU for rent on marketplace |

### REPL slash commands

```
/gpu list       — list GPU types
/gpu budget     — show/set budget
/gpu jobs       — job history
/gpu audit      — audit log
```

## Gateway API

### Endpoints

```
GET  /api/billing/gpu/types       — GPU catalog with pricing
GET  /api/billing/gpu/templates   — Deploy templates
GET  /api/billing/gpu/jobs        — User's GPU job history
POST /api/billing/gpu/provision   — Provision GPU instance
```

### Pricing model

All prices are **provider cost × 1.2 margin** (20%), same as LLM API billing.

| GPU | Provider Cost | Platform Fee (20%) | Total /hr |
|-----|-------------|-------------------|-----------|
| NVIDIA A100 80GB | $0.49 | $0.10 | **$0.59** |
| NVIDIA A100 40GB | $0.39 | $0.08 | **$0.47** |
| NVIDIA RTX 4090 | $0.29 | $0.06 | **$0.35** |
| NVIDIA H100 80GB | $1.49 | $0.30 | **$1.79** |
| NVIDIA L40S | $0.59 | $0.12 | **$0.71** |

### Templates (one-click deploy)

| Template | Image | Use Case |
|----------|-------|----------|
| PyTorch 2.5 | `pytorch/pytorch:2.5.0-cuda12.4-cudnn9-runtime` | Deep learning training |
| TensorFlow 2.17 | `tensorflow/tensorflow:2.17.0-gpu` | ML training with Keras |
| Jupyter Lab | `quay.io/jupyter/pytorch-notebook:cuda-latest` | Interactive notebooks |
| CUDA 12.4 Base | `nvidia/cuda:12.4.0-base` | Minimal CUDA environment |
| vLLM Inference | `vllm/vllm-openai:latest` | LLM inference server |
| SD WebUI | `ashleykza/stable-diffusion-webui:latest` | Image generation |

## Web UI

The GPU marketplace is available at **dirgha.ai/app/gpu**:

- Browse GPU types with transparent pricing breakdown
- Deploy with one click (template or custom image)
- View job history with live cost tracking
- List GPU compute on the peer-to-peer marketplace

## Security

- **Budget caps**: Set monthly GPU spending limit via `dirgha gpu budget $50`
- **Audit log**: Every provision/destroy recorded at `~/.dirgha/gpu-audit.jsonl`
- **Auto-destroy**: Instances auto-terminate after inactivity or job completion
- **Approval flow**: Cost confirmation before provisioning (uses existing approval bus)

## Architecture

```
User → dirgha CLI / Web UI
  → Gateway (api.dirgha.ai)
    → checkBilling() deducts credits
    → Provisions via provider API
    → Stores job in gpu_jobs table
    → Returns SSH command
  → User's instance running (billing per second)
  → Destroy / auto-destroy → stop billing
```
