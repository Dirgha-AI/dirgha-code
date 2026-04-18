/**
 * agents/delegate.ts — Sub-agent management
 */
import type { Agent, Task } from './types.js';

export interface Delegation {
  parentId: string;
  childId: string;
  task: Task;
  status: 'pending' | 'running' | 'complete' | 'failed';
}

const delegations: Map<string, Delegation> = new Map();

export function delegateTask(
  parent: Agent,
  child: Agent,
  task: Task
): string {
  const id = `${parent.id}->${child.id}:${Date.now()}`;
  
  delegations.set(id, {
    parentId: parent.id,
    childId: child.id,
    task,
    status: 'pending'
  });
  
  return id;
}

export function updateDelegationStatus(
  id: string,
  status: Delegation['status']
): void {
  const d = delegations.get(id);
  if (d) {
    d.status = status;
  }
}

export function getDelegation(id: string): Delegation | undefined {
  return delegations.get(id);
}

export function getChildTasks(parentId: string): Delegation[] {
  return Array.from(delegations.values()).filter(d => d.parentId === parentId);
}

export function escalateToParent(
  childId: string,
  issue: string
): { parentId: string; issue: string } | null {
  for (const [_, d] of delegations) {
    if (d.childId === childId && d.status === 'failed') {
      return { parentId: d.parentId, issue };
    }
  }
  return null;
}
