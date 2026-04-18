/**
 * business/context.ts — Org/project-aware memory
 */
import type { Organization, Project, BillingContext } from './types.js';

const orgs: Map<string, Organization> = new Map();
const projects: Map<string, Project> = new Map();

export function setOrg(org: Organization): void {
  orgs.set(org.id, org);
}

export function getOrg(id: string): Organization | undefined {
  return orgs.get(id);
}

export function setProject(project: Project): void {
  projects.set(project.id, project);
}

export function getProject(id: string): Project | undefined {
  return projects.get(id);
}

export function getCurrentContext(): { org?: Organization; project?: Project } {
  // In real implementation: read from .dirgha/config.json
  const currentProjectId = process.env.DIRGHA_PROJECT_ID;
  const currentOrgId = process.env.DIRGHA_ORG_ID;
  
  return {
    org: currentOrgId ? getOrg(currentOrgId) : undefined,
    project: currentProjectId ? getProject(currentProjectId) : undefined
  };
}

export function tagFactWithContext(fact: string): string {
  const { org, project } = getCurrentContext();
  const tags: string[] = [];
  
  if (org) tags.push(`org:${org.id}`);
  if (project) tags.push(`project:${project.id}`);
  
  return tags.length > 0 ? `[${tags.join(',')}] ${fact}` : fact;
}
