// @ts-nocheck
/**
 * memory/unified.ts — Unified Memory Provider
 * 
 * Integrates the 5-layer Unified Memory system (Session, Project, Workspace, Semantic, Global)
 * with the agent loop.
 */
import { MemoryProvider, MemoryProviderOpts } from './provider.js';
import { getMemory } from '../utils/unified-memory.js';
import { UnifiedMemory } from '@dirgha/core/unified-memory';

export class UnifiedMemoryProvider implements MemoryProvider {
  readonly name = 'unified';
  private memory: UnifiedMemory;

  constructor() {
    this.memory = getMemory();
  }

  async initialize(sessionId: string, _opts: MemoryProviderOpts): Promise<void> {
    // Session is already resumed by getMemory() if lastSessionId exists in state.
    // If a new sessionId is passed from the loop, we could potentially use it,
    // but the CLI unified memory manages its own session lifecycle.
  }

  systemPromptBlock(): string {
    return '## Unified Memory (5-Layer)\n' +
           'You have access to a sophisticated memory system with 5 layers: Session (isolated), Project, Workspace (GEPA-optimized), Semantic (rules/lessons), and Global.\n' +
           'Use the unified memory tools to maintain high-quality context.';
  }

  async prefetch(query: string): Promise<string> {
    const context = this.memory.getContextWindow({ n: 10 });
    const rules = this.memory.getActiveRules(query);
    
    let block = '## Active Rules\n' + (rules.length > 0 ? rules.map(r => `- ${r.content}`).join('\n') : 'No specific rules for this context.') + '\n\n';
    block += '## Relevant Context\n' + (context.length > 0 ? context.map(m => `- [${m.tier}] ${m.content}`).join('\n') : 'No relevant workspace context found.');
    
    return block;
  }

  async syncTurn(userMsg: string, assistantMsg: string): Promise<void> {
    // Reinforce memories used in the turn (best-effort)
    // In a more advanced impl, we would extract IDs from the assistant's usage
  }

  getToolSchemas(): any[] {
    return [
      {
        name: 'remember',
        description: 'Save a memory to the unified graph. Layers: session, project, workspace, global. Types: fact, rule, lesson.',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The content to remember' },
            layer: { type: 'string', enum: ['session', 'project', 'workspace', 'global'], default: 'workspace' },
            type: { type: 'string', enum: ['fact', 'rule', 'lesson'], default: 'fact' },
            tags: { type: 'array', items: { type: 'string' } },
            topic: { type: 'string', description: 'Topic for lessons' },
            condition: { type: 'string', enum: ['always', 'never', 'when'], description: 'Condition for rules' },
            trigger: { type: 'string', description: 'Trigger for "when" rules' }
          },
          required: ['content']
        }
      },
      {
        name: 'recall',
        description: 'Search across all memory layers.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', default: 10 }
          },
          required: ['query']
        }
      }
    ];
  }

  async handleToolCall(name: string, input: Record<string, any>): Promise<string> {
    switch (name) {
      case 'remember': {
        const entry = this.memory.store(input.content, {
          layer: input.layer,
          type: input.type,
          tags: input.tags,
          topic: input.topic,
          condition: input.condition,
          trigger: input.trigger,
          action: input.type === 'rule' ? input.content : undefined,
          source: 'claimed'
        });
        return `Remembered to ${entry.layer} layer (ID: ${entry.id})`;
      }
      case 'recall': {
        const results = this.memory.search(input.query, { limit: input.limit });
        if (results.length === 0) return 'No matching memories found.';
        return results.map(r => `[${r.layer}/${r.tier}] ${r.content}`).join('\n');
      }
      default:
        return `Unknown unified memory tool: ${name}`;
    }
  }

  async onSessionEnd(): Promise<void> {
    // No cleanup needed
  }
}
