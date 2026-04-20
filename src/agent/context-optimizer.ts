import { Message } from '../types.js';
import { graphMemory } from '../memory/graph.js';

export function optimizeContext(messages: Message[], maxTokens = 4000): Message[] {
  // Simple optimization: preserve system, last turn, and "hot" symbol mentions
  if (messages.length < 5) return messages;

  const optimized: Message[] = [];
  const systemMsg = messages.find(m => m.role === 'system');
  if (systemMsg) optimized.push(systemMsg);

  // Extract symbols from the last 2 turns
  const recentText = messages.slice(-4).map(m => typeof m.content === 'string' ? m.content : '').join(' ');
  const symbols = recentText.match(/\b[A-Z][a-zA-Z0-9_]{3,}\b/g) || [];

  // Find neighbors of these symbols in graph memory
  const contextBoost: string[] = [];
  for (const sym of symbols) {
    const neighbors = graphMemory.getNeighbors(sym);
    neighbors.forEach(n => contextBoost.push(`${n.label} (${n.type})`));
  }

  // Preserve the last few messages
  const tail = messages.slice(-10);
  
  // Create a summary message of boosted context
  if (contextBoost.length > 0) {
    optimized.push({
      role: 'system',
      content: `[Holographic Context] Related symbols: ${Array.from(new Set(contextBoost)).slice(0, 10).join(', ')}`
    });
  }

  return [...optimized, ...tail];
}
