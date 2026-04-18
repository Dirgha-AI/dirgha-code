/**
 * agent/orchestration/researcher.ts — Deep Research Agentic Workflow
 * Porting Feynman-style multi-agent research to the Dirgha Swarm.
 * SPDX-License-Identifier: BUSL-1.1
 */

import { callGateway as streamChat } from '../gateway.js';
import { webSearchTool, webFetchTool } from '../../tools/search.js';
import type { Message } from '../../types.js';
import { getDefaultModel } from '../../providers/detection.js';

export interface ResearchReport {
  topic: string;
  summary: string;
  findings: Array<{ claim: string; evidence: string; source: string; confidence: number }>;
  citations: string[];
  unresolved_questions: string[];
}

export class DeepResearcher {
  private model: string;
  
  constructor(model = getDefaultModel()) {
    this.model = model;
  }

  /**
   * Primary entry point for deep research tasks
   */
  async performResearch(topic: string, depth = 2): Promise<ResearchReport> {
    console.log(`[DeepResearch] Starting investigation: ${topic} (Depth: ${depth})`);
    
    // 1. Generate search queries
    const queries = await this.generateQueries(topic);
    
    // 2. Parallel search and fetch (The "Gatherer" step)
    const rawData = await this.gatherEvidence(queries);
    
    // 3. Review and Verify (The "Feynman" step)
    const report = await this.synthesizeReport(topic, rawData);
    
    return report;
  }

  private async generateQueries(topic: string): Promise<string[]> {
    const prompt = `Generate 5 diverse search queries to deeply investigate the following topic: "${topic}". 
    Focus on finding technical details, conflicting viewpoints, and primary sources. 
    Return as a JSON array of strings: ["query1", "query2", ...]`;
    
    const res = await streamChat([{ role: 'user', content: prompt }], 'Analyze queries', this.model);
    try {
      return JSON.parse(res.content[0]?.text || '[]');
    } catch {
      return [topic];
    }
  }

  private async gatherEvidence(queries: string[]): Promise<string[]> {
    const results = await Promise.all(queries.map(async q => {
      const searchRes = await webSearchTool({ query: q, max_results: 3 });
      if (searchRes.error) return '';
      
      // Extract top URL and fetch full content for depth
      const firstUrlMatch = searchRes.result.match(/https?:\/\/[^\s]+/);
      if (firstUrlMatch) {
        const fetchRes = await webFetchTool({ url: firstUrlMatch[0] });
        return `[Source: ${firstUrlMatch[0]}]\n${fetchRes.result}\n---\n`;
      }
      return searchRes.result;
    }));
    
    return results.filter(Boolean);
  }

  private async synthesizeReport(topic: string, data: string[]): Promise<ResearchReport> {
    const systemPrompt = `You are a Senior Research Scientist. Your goal is to synthesize the provided evidence into a structured Research Report.
    Adhere to the Feynman principle: expose the chain of thought, grade every claim's confidence, and verify every citation.
    
    Output JSON format:
    {
      "topic": "...",
      "summary": "...",
      "findings": [{"claim": "...", "evidence": "...", "source": "...", "confidence": 0.0-1.0}],
      "citations": ["url1", "url2"],
      "unresolved_questions": ["..."]
    }`;

    const messages: Message[] = [
      { role: 'user', content: `Topic: ${topic}\n\nEvidence Collected:\n${data.join('\n')}` }
    ];

    const res = await streamChat(messages, systemPrompt, this.model);
    try {
      return JSON.parse(res.content[0]?.text || '{}');
    } catch {
      throw new Error("Failed to synthesize research report");
    }
  }
}
