/**
 * analytics/insights.ts — Usage patterns and insights
 */
export interface UsagePattern {
  metric: string;
  value: number;
  change: number; // percentage change
  period: 'daily' | 'weekly' | 'monthly';
}

export interface SessionMetrics {
  sessionId: string;
  duration: number;
  messages: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  toolsUsed: string[];
  factsCreated: number;
  factsQueried: number;
}

const metrics: Map<string, SessionMetrics> = new Map();

export function recordSessionMetric(m: SessionMetrics): void {
  metrics.set(m.sessionId, m);
}

export function getTopTools(): Array<{ tool: string; count: number }> {
  const counts = new Map<string, number>();
  
  for (const m of metrics.values()) {
    for (const tool of m.toolsUsed) {
      counts.set(tool, (counts.get(tool) || 0) + 1);
    }
  }
  
  return Array.from(counts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function getAverageSessionDuration(): number {
  const durations = Array.from(metrics.values()).map(m => m.duration);
  return durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
}

export function getDailyCost(): number {
  const today = new Date().toISOString().split('T')[0];
  let cost = 0;
  
  for (const m of metrics.values()) {
    if (m.sessionId.startsWith(today)) {
      cost += m.cost;
    }
  }
  
  return cost;
}
