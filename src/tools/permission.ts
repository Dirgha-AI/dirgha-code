/**
 * Permission seam.
 *
 * L2 tools do not implement policy; they ask this seam whether a given
 * action on a given target is permitted in the current context. The
 * default engine here is permissive-with-approvals (writes, shell, and
 * outside-cwd access all require approval). The production engine is
 * injected from L6 (safety/policy.ts) which reads declarative rules.
 */

import { resolve, sep } from 'node:path';

export interface PermissionCheck {
  tool: string;
  action: 'read' | 'write' | 'exec' | 'delete' | 'network';
  target: string;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
}

export interface PermissionEngine {
  check(req: PermissionCheck): PermissionDecision;
}

export class DefaultPermissionEngine implements PermissionEngine {
  constructor(private readonly cwd: string) {}

  check(req: PermissionCheck): PermissionDecision {
    const insideCwd = isInside(this.cwd, req.target);
    switch (req.action) {
      case 'read':
        return insideCwd
          ? { allowed: true, reason: 'read inside cwd', requiresApproval: false }
          : { allowed: true, reason: 'read outside cwd', requiresApproval: true };
      case 'write':
        return insideCwd
          ? { allowed: true, reason: 'write inside cwd', requiresApproval: true }
          : { allowed: true, reason: 'write outside cwd', requiresApproval: true };
      case 'delete':
        return { allowed: true, reason: 'delete', requiresApproval: true };
      case 'exec':
        return { allowed: true, reason: 'exec', requiresApproval: true };
      case 'network':
        return { allowed: true, reason: 'network', requiresApproval: true };
    }
  }
}

function isInside(root: string, target: string): boolean {
  if (!target) return false;
  const abs = resolve(root, target);
  const normRoot = resolve(root);
  const baseSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep;
  return abs === normRoot || abs.startsWith(baseSep);
}
