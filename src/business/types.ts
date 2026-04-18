/**
 * business/types.ts — Business context types
 */
export interface Organization {
  id: string;
  name: string;
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  createdAt: string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  billingTag?: string;
  knowledgeGraphId: string;
  createdAt: string;
}

export interface BillingContext {
  orgId: string;
  projectId: string;
  tier: string;
  monthlyBudget: number;
  usedThisMonth: number;
}
