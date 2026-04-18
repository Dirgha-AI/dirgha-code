/**
 * llm/local.ts - Local LLM interface
 * Tries llama-server (llama.cpp) first, falls back to Ollama
 */

interface LLMOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

interface LLMResponse {
  text: string;
  tokensUsed: number;
  duration: number;
}

const LLAMACPP_URL = process.env.LLAMACPP_URL ?? 'http://localhost:8080'
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'

export class LocalLLM {
  private defaultModel = process.env.LOCAL_MODEL ?? 'local'

  /** Try llama-server first, fall back to Ollama */
  async generate(prompt: string, opts: LLMOptions = {}): Promise<LLMResponse> {
    const start = Date.now()

    // Try llama-server (OpenAI format)
    try {
      const r = await fetch(`${LLAMACPP_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [
            ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          max_tokens: opts.maxTokens ?? 2048,
          temperature: opts.temperature ?? 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (r.ok) {
        const d = await r.json() as any
        const text = d.choices?.[0]?.message?.content ?? ''
        const tokens = d.usage?.completion_tokens ?? 0
        return { text, tokensUsed: tokens, duration: Date.now() - start }
      }
    } catch { /* fall through to Ollama */ }

    // Fallback: Ollama
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? 'gemma4:4b',
        prompt: opts.systemPrompt ? `${opts.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
        options: { temperature: opts.temperature, num_predict: opts.maxTokens }
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!r.ok) throw new Error(`Both llama-server and Ollama unavailable`)
    const d = await r.json() as any
    return { text: d.response ?? '', tokensUsed: d.eval_count ?? 0, duration: Date.now() - start }
  }

  async isAvailable(): Promise<'llamacpp' | 'ollama' | null> {
    try {
      const r = await fetch(`${LLAMACPP_URL}/health`, { signal: AbortSignal.timeout(1500) })
      if (r.ok) return 'llamacpp'
    } catch {}
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) })
      if (r.ok) return 'ollama'
    } catch {}
    return null
  }
}

// Singleton
let localLLM: LocalLLM | null = null;

export function getLocalLLM(): LocalLLM {
  if (!localLLM) {
    localLLM = new LocalLLM();
  }
  return localLLM;
}
