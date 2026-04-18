/**
 * mcp/resources.ts — Knowledge resource exposure
 */
import type { MCPResource } from './server.js';

export const KNOWLEDGE_RESOURCES: MCPResource[] = [
  {
    uri: 'dirgha://facts/recent',
    name: 'Recent Facts',
    description: 'Recently curated facts from knowledge graph',
    mimeType: 'application/json'
  },
  {
    uri: 'dirgha://facts/search',
    name: 'Fact Search',
    description: 'Search query endpoint for facts',
    mimeType: 'application/json'
  },
  {
    uri: 'dirgha://session/current',
    name: 'Current Session',
    description: 'Current CLI session context',
    mimeType: 'application/json'
  }
];

export function registerKnowledgeResources(server: any): void {
  for (const resource of KNOWLEDGE_RESOURCES) {
    server.registerResource(resource);
  }
}
