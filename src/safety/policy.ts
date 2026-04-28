/**
 * Policy engine. Evaluates a PermissionCheck against an ordered rule
 * list and returns a decision (allow / deny / require_approval). The
 * default ruleset ships in-code; user and project rules are merged at
 * config load time.
 */

import { resolve } from 'node:path';
import type { PermissionCheck, PermissionDecision } from '../tools/permission.js';

export interface PolicyRule {
  id: string;
  applies: { tools?: string[]; actions?: PermissionCheck['action'][] };
  when?: PolicyCondition;
  effect: 'allow' | 'deny' | 'require_approval';
  reason: string;
}

export interface PolicyCondition {
  pathMatches?: string;      // glob relative to cwd
  commandMatches?: string;   // regex against target
  outsideCwd?: boolean;
  startsWith?: string;
}

export interface PolicyEngineOptions {
  cwd: string;
  rules?: PolicyRule[];
}

export interface PolicyEngine {
  evaluate(req: PermissionCheck): PermissionDecision;
}

export const DEFAULT_RULES: PolicyRule[] = [
  {
    id: 'read-inside-cwd',
    applies: { actions: ['read'] },
    when: { outsideCwd: false },
    effect: 'allow',
    reason: 'reads inside the working directory are permitted without prompting',
  },
  {
    id: 'read-outside-cwd',
    applies: { actions: ['read'] },
    when: { outsideCwd: true },
    effect: 'require_approval',
    reason: 'reading outside the working directory requires approval',
  },
  {
    id: 'write-inside-cwd',
    applies: { actions: ['write'] },
    when: { outsideCwd: false },
    effect: 'require_approval',
    reason: 'writes inside the working directory require approval',
  },
  {
    id: 'write-outside-cwd',
    applies: { actions: ['write'] },
    when: { outsideCwd: true },
    effect: 'deny',
    reason: 'writes outside the working directory are forbidden by default',
  },
  {
    id: 'delete',
    applies: { actions: ['delete'] },
    effect: 'require_approval',
    reason: 'deletions require approval',
  },
  {
    id: 'exec-danger-force',
    applies: { actions: ['exec'] },
    when: { commandMatches: '(?:rm -rf|git push --force|git reset --hard|DROP TABLE|kubectl delete)' },
    effect: 'require_approval',
    reason: 'potentially destructive command requires explicit approval',
  },
  {
    id: 'exec-default',
    applies: { actions: ['exec'] },
    effect: 'require_approval',
    reason: 'shell execution requires approval',
  },
  {
    id: 'network-default',
    applies: { actions: ['network'] },
    effect: 'require_approval',
    reason: 'network access requires approval',
  },
];

export function createPolicyEngine(opts: PolicyEngineOptions): PolicyEngine {
  const cwd = resolve(opts.cwd);
  const rules = [...(opts.rules ?? []), ...DEFAULT_RULES];

  const evaluate = (req: PermissionCheck): PermissionDecision => {
    for (const rule of rules) {
      if (!appliesTo(rule, req)) continue;
      if (!conditionMatches(rule.when, req, cwd)) continue;
      return decisionFor(rule);
    }
    return {
      allowed: true,
      reason: 'default catch-all allow-with-approval',
      requiresApproval: true,
    };
  };

  return { evaluate };
}

function appliesTo(rule: PolicyRule, req: PermissionCheck): boolean {
  if (rule.applies.tools && !rule.applies.tools.includes(req.tool)) return false;
  if (rule.applies.actions && !rule.applies.actions.includes(req.action)) return false;
  return true;
}

function conditionMatches(cond: PolicyCondition | undefined, req: PermissionCheck, cwd: string): boolean {
  if (!cond) return true;
  if (cond.outsideCwd !== undefined) {
    const inside = isInside(cwd, req.target);
    if (cond.outsideCwd && inside) return false;
    if (!cond.outsideCwd && !inside) return false;
  }
  if (cond.commandMatches) {
    try {
      const rx = new RegExp(cond.commandMatches);
      if (!rx.test(req.target)) return false;
    } catch { return false; }
  }
  if (cond.startsWith && !req.target.startsWith(cond.startsWith)) return false;
  return true;
}

function decisionFor(rule: PolicyRule): PermissionDecision {
  switch (rule.effect) {
    case 'allow':
      return { allowed: true, reason: `${rule.id}: ${rule.reason}`, requiresApproval: false };
    case 'deny':
      return { allowed: false, reason: `${rule.id}: ${rule.reason}`, requiresApproval: false };
    case 'require_approval':
      return { allowed: true, reason: `${rule.id}: ${rule.reason}`, requiresApproval: true };
  }
}

function isInside(root: string, target: string): boolean {
  if (!target) return false;
  if (!target.startsWith('/')) return true;
  const normRoot = root.replace(/\/+$/, '');
  return target === normRoot || target.startsWith(`${normRoot}/`);
}
