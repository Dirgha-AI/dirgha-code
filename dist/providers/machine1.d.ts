/**
 * Machine 1 provider — Dirgha's industrial intelligence model.
 *
 * Uses llama-cli (llama.cpp) for fully local, offline inference.
 * No Ollama. No server process. No cloud. No GPU required.
 * A single GGUF (~350MB Q4_K_M) runs on any laptop CPU.
 *
 * Request flow:
 *   1. Locate llama-cli binary and machine1 GGUF.
 *   2. Build a ChatML-formatted prompt from the conversation history.
 *   3. (Optional) Query Qdrant codex collection for relevant machine context.
 *   4. Spawn llama-cli, stream stdout tokens as text_delta events.
 *   5. Prefix every response with "[Machine 1]".
 *
 * Environment overrides:
 *   MACHINE1_MODEL_PATH  — absolute path to .gguf file
 *   LLAMA_CLI_PATH       — path to llama-cli binary
 *   QDRANT_URL           — Qdrant base URL (default: http://localhost:6333)
 */
import type { AgentEvent, StreamRequest } from '../kernel/types.js';
import type { Provider, ProviderConfig } from './iface.js';
export declare class Machine1Provider implements Provider {
    readonly id = "machine1";
    private readonly timeoutMs;
    constructor(config: ProviderConfig);
    supportsTools(_modelId: string): boolean;
    supportsThinking(_modelId: string): boolean;
    stream(req: StreamRequest): AsyncIterable<AgentEvent>;
    private _stream;
}
