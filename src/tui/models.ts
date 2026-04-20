export const MODELS = [
  { id: 'accounts/fireworks/routers/kimi-k2p5-turbo',        label: 'Kimi K2.5 Turbo',     provider: 'fireworks',   display: 'Fireworks',   tag: 'free' },
  { id: 'accounts/fireworks/models/deepseek-v3p2',           label: 'DeepSeek V3.2',        provider: 'fireworks',   display: 'Fireworks',   tag: 'fast' },
  { id: 'accounts/fireworks/models/qwen3-max',               label: 'Qwen3 Max',            provider: 'fireworks',   display: 'Fireworks',   tag: 'fast' },
  { id: 'accounts/fireworks/models/llama-v4-maverick',       label: 'Llama 4 Maverick',     provider: 'fireworks',   display: 'Fireworks',   tag: 'fast' },
  { id: 'claude-opus-4-7',                                   label: 'Claude Opus 4.7',      provider: 'anthropic',   display: 'Anthropic',   tag: 'best' },
  { id: 'claude-opus-4-6',                                   label: 'Claude Opus 4.6',      provider: 'anthropic',   display: 'Anthropic',   tag: 'best' },
  { id: 'claude-sonnet-4-6',                                 label: 'Claude Sonnet 4.6',    provider: 'anthropic',   display: 'Anthropic',   tag: 'full' },
  { id: 'claude-haiku-4-5',                                  label: 'Claude Haiku 4.5',     provider: 'anthropic',   display: 'Anthropic',   tag: 'fast' },
  { id: 'gpt-5.4',                                           label: 'GPT-5.4',              provider: 'openai',      display: 'OpenAI',      tag: 'best' },
  { id: 'gpt-5.4-mini',                                      label: 'GPT-5.4 Mini',         provider: 'openai',      display: 'OpenAI',      tag: 'fast' },
  { id: 'o4-mini',                                           label: 'o4-mini',              provider: 'openai',      display: 'OpenAI',      tag: 'fast' },
  { id: 'gemini-3.1-pro-preview',                            label: 'Gemini 3.1 Pro',       provider: 'gemini',      display: 'Gemini',      tag: 'best' },
  { id: 'gemini-3.1-flash',                                  label: 'Gemini 3.1 Flash',     provider: 'gemini',      display: 'Gemini',      tag: 'fast' },
  { id: 'grok-4',                                            label: 'Grok 4',               provider: 'xai',         display: 'xAI',         tag: 'best' },
  { id: 'anthropic/claude-opus-4-7',                         label: 'Claude Opus 4.7',      provider: 'openrouter',  display: 'OpenRouter',  tag: 'best' },
  { id: 'openai/gpt-5.4',                                    label: 'GPT-5.4',              provider: 'openrouter',  display: 'OpenRouter',  tag: 'best' },
  { id: 'openrouter/elephant-alpha',                         label: 'Elephant Alpha',       provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'qwen/qwen3-coder:free',                             label: 'Qwen3 Coder',          provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'meta-llama/llama-4-scout:free',                     label: 'Llama 4 Scout',        provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'deepseek/deepseek-r1:free',                         label: 'DeepSeek R1',          provider: 'openrouter',  display: 'OpenRouter',  tag: 'free' },
  { id: 'minimax/minimax-m2.7',                              label: 'MiniMax M2.7',         provider: 'nvidia',      display: 'NVIDIA',      tag: 'best' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct',           label: 'Llama 4 Maverick',     provider: 'nvidia',      display: 'NVIDIA',      tag: 'full' },
  { id: 'meta/llama-4-scout-17b-16e-instruct',               label: 'Llama 4 Scout',        provider: 'nvidia',      display: 'NVIDIA',      tag: 'fast' },
] as const;

export const PROV_COLORS: Record<string, string> = {
  fireworks:  '#FF6B35', anthropic:  '#CC785C', openai:     '#10A37F',
  gemini:     '#4285F4', openrouter: '#4A9EFF', nvidia:     '#76B900',
  litellm:    '#A78BFA', gateway:    '#22C55E',
};

export const TAG_COLORS: Record<string, string> = {
  free: '#10B981', fast: '#60A5FA', best: '#F59E0B', big: '#A78BFA', full: '#6B7280', dev: '#EF4444',
};

export const { order: PROV_ORDER, map: PROV_MAP } = (() => {
  const order: string[] = [];
  const map: Record<string, Array<any>> = {};
  let num = 0;
  for (const m of MODELS) {
    if (!map[m.provider]) { map[m.provider] = []; order.push(m.provider); }
    map[m.provider]!.push({ ...m, num: ++num });
  }
  return { order, map };
})();
