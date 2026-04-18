/**
 * swarm/templates/SalesforceDomains.ts — Salesforce decomposition templates
 */
import type { Domain, Task } from '../types.js';

export interface DomainTemplate {
  name: string;
  domain: Domain;
  agents: number;
  duration: string;
  modules: ModuleTemplate[];
}

export interface ModuleTemplate {
  name: string;
  agents: number;
  duration: string;
  tasks: string[];
}

export const SALESFORCE_DOMAINS: DomainTemplate[] = [
  {
    name: 'Sales Cloud (CRM Core)',
    domain: 'sales-cloud',
    agents: 20,
    duration: '4 weeks',
    modules: [
      {
        name: 'Lead Management',
        agents: 5,
        duration: '2 weeks',
        tasks: [
          'Lead capture forms',
          'Lead scoring engine',
          'Lead assignment rules',
          'Lead conversion workflow',
          'Duplicate detection',
        ],
      },
      {
        name: 'Opportunity Tracking',
        agents: 5,
        duration: '2 weeks',
        tasks: [
          'Opportunity stages',
          'Stage history tracking',
          'Probability calculation',
          'Competitor tracking',
          'Revenue forecasting',
        ],
      },
      {
        name: 'Account/Contact Management',
        agents: 3,
        duration: '1 week',
        tasks: [
          'Account hierarchy',
          'Contact roles',
          'Relationship mapping',
          'Activity timeline',
        ],
      },
      {
        name: 'Pipeline Management',
        agents: 4,
        duration: '2 weeks',
        tasks: [
          'Pipeline views',
          'Drag-drop stage changes',
          'Pipeline analytics',
          'Team quotas',
        ],
      },
    ],
  },
  {
    name: 'Service Cloud (Support)',
    domain: 'service-cloud',
    agents: 15,
    duration: '5 weeks',
    modules: [
      {
        name: 'Case Management',
        agents: 5,
        duration: '3 weeks',
        tasks: [
          'Case creation',
          'Case routing/assignment',
          'SLA tracking',
          'Escalation rules',
          'Case closure workflow',
        ],
      },
      {
        name: 'Knowledge Base',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'Article management',
          'Categories/tags',
          'Search functionality',
          'Article ratings',
        ],
      },
      {
        name: 'Omni-Channel Routing',
        agents: 4,
        duration: '3 weeks',
        tasks: [
          'Queue management',
          'Agent presence',
          'Workload balancing',
          'Channel routing (email, chat, phone)',
        ],
      },
      {
        name: 'Chat/Messaging',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'Live chat widget',
          'Chat routing',
          'Bot integration',
          'Chat transcripts',
        ],
      },
    ],
  },
  {
    name: 'Marketing Cloud',
    domain: 'marketing-cloud',
    agents: 15,
    duration: '4 weeks',
    modules: [
      {
        name: 'Email Studio',
        agents: 4,
        duration: '2 weeks',
        tasks: [
          'Email templates',
          'Drag-drop editor',
          'A/B testing',
          'Deliverability tracking',
        ],
      },
      {
        name: 'Journey Builder',
        agents: 5,
        duration: '3 weeks',
        tasks: [
          'Visual journey builder',
          'Entry/exit criteria',
          'Decision splits',
          'Wait activities',
        ],
      },
      {
        name: 'Social Studio',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'Social listening',
          'Content calendar',
          'Publish scheduler',
          'Engagement tracking',
        ],
      },
      {
        name: 'Analytics',
        agents: 3,
        duration: '3 weeks',
        tasks: [
          'Campaign ROI',
          'Engagement metrics',
          'Attribution modeling',
          'Custom dashboards',
        ],
      },
    ],
  },
  {
    name: 'Commerce Cloud',
    domain: 'commerce-cloud',
    agents: 14,
    duration: '4 weeks',
    modules: [
      {
        name: 'Product Catalog',
        agents: 4,
        duration: '2 weeks',
        tasks: [
          'Product management',
          'Categories/taxonomy',
          'Inventory tracking',
          'Product search',
        ],
      },
      {
        name: 'Shopping Cart',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'Cart persistence',
          'Cart rules/discounts',
          'Guest checkout',
          'Abandoned cart recovery',
        ],
      },
      {
        name: 'Pricing Engine',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'Price lists',
          'Volume discounts',
          'Promotions',
          'Currency conversion',
        ],
      },
      {
        name: 'Order Management',
        agents: 4,
        duration: '3 weeks',
        tasks: [
          'Order workflow',
          'Fulfillment tracking',
          'Returns/refunds',
          'Invoice generation',
        ],
      },
    ],
  },
  {
    name: 'Platform (Shared)',
    domain: 'platform',
    agents: 26,
    duration: '6 weeks',
    modules: [
      {
        name: 'Auth/Identity',
        agents: 5,
        duration: '3 weeks',
        tasks: [
          'SSO/SAML',
          'OAuth 2.0',
          'Multi-factor auth',
          'Role-based access',
          'Session management',
        ],
      },
      {
        name: 'API Gateway',
        agents: 4,
        duration: '2 weeks',
        tasks: [
          'REST API design',
          'GraphQL support',
          'Rate limiting',
          'API versioning',
        ],
      },
      {
        name: 'Workflow Engine',
        agents: 5,
        duration: '3 weeks',
        tasks: [
          'Process builder',
          'Flow automation',
          'Approval processes',
          'Email alerts',
        ],
      },
      {
        name: 'Reporting/Analytics',
        agents: 4,
        duration: '3 weeks',
        tasks: [
          'Report builder',
          'Dashboard widgets',
          'Scheduled reports',
          'Data export',
        ],
      },
      {
        name: 'Mobile SDK',
        agents: 3,
        duration: '2 weeks',
        tasks: [
          'iOS SDK',
          'Android SDK',
          'Offline sync',
          'Push notifications',
        ],
      },
      {
        name: 'Admin/Setup',
        agents: 5,
        duration: '3 weeks',
        tasks: [
          'Object manager',
          'Field configuration',
          'Page layouts',
          'Validation rules',
        ],
      },
    ],
  },
];

export function calculateTotalResources(): {
  totalAgents: number;
  totalWeeks: number;
  totalModules: number;
  totalTasks: number;
} {
  let totalAgents = 0;
  let totalWeeks = 0;
  let totalModules = 0;
  let totalTasks = 0;
  
  for (const domain of SALESFORCE_DOMAINS) {
    totalAgents += domain.agents;
    totalWeeks += parseInt(domain.duration);
    totalModules += domain.modules.length;
    
    for (const module of domain.modules) {
      totalTasks += module.tasks.length;
    }
  }
  
  return { totalAgents, totalWeeks, totalModules, totalTasks };
}

export function generateProjectPlan(): string {
  const { totalAgents, totalModules, totalTasks } = calculateTotalResources();
  
  return `
# Salesforce Clone Project Plan

## Overview
- **Duration**: 90 days (13 weeks)
- **Max Concurrent Agents**: 100
- **Total Agent-Weeks**: ${totalAgents}
- **Total Modules**: ${totalModules}
- **Total Tasks**: ${totalTasks}
- **Estimated Cost**: $150,000

## Domain Breakdown
${SALESFORCE_DOMAINS.map(d => `
### ${d.name}
- Agents: ${d.agents}
- Duration: ${d.duration}
- Modules: ${d.modules.length}

${d.modules.map(m => `  - ${m.name} (${m.agents} agents, ${m.duration})`).join('\n')}
`).join('\n')}

## Critical Path
1. Week 1-2: Platform Foundation (Auth, API, DB)
2. Week 3-6: Parallel Domain Development
3. Week 7-10: Integration & Testing
4. Week 11-13: Optimization & Launch

## Risk Mitigation
- CRDT editing prevents merge conflicts
- Multi-model verification ensures quality
- Daily cost tracking prevents overruns
- Continuous integration catches issues early
`;
}
