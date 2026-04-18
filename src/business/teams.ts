/**
 * business/teams.ts — Team knowledge spaces
 */
import type { Organization, Project } from './types.js';

export interface TeamMember {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

const teams: Map<string, TeamMember[]> = new Map();

export function addTeamMember(orgId: string, member: TeamMember): void {
  const current = teams.get(orgId) || [];
  current.push(member);
  teams.set(orgId, current);
}

export function getTeamMembers(orgId: string): TeamMember[] {
  return teams.get(orgId) || [];
}

export function canAccess(
  userId: string,
  orgId: string,
  requiredRole: 'admin' | 'member' | 'viewer'
): boolean {
  const members = teams.get(orgId) || [];
  const member = members.find(m => m.id === userId);
  
  if (!member) return false;
  
  const roleHierarchy = { admin: 3, member: 2, viewer: 1 };
  return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
}
